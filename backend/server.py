from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import asyncio
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="DIR MAP WEB")
api_router = APIRouter(prefix="/api")

# Sensitive file patterns
SENSITIVE_NAMES = {
    ".env", ".env.local", ".env.production", ".env.development",
    ".git", ".gitignore", ".htaccess", ".htpasswd",
    "error_log", "errors.log", "debug.log", "access_log", "access.log",
    "wp-config.php", "wp-config.php.bak", "config.php", "configuration.php",
    "database.sql", "dump.sql", "backup.sql",
    ".DS_Store", "Thumbs.db", ".vscode", ".idea",
    "robots.txt", "sitemap.xml", "phpinfo.php", "info.php",
    "composer.json", "composer.lock", "package.json", "yarn.lock",
    ".npmrc", ".pypirc", "id_rsa", "id_dsa",
}
SENSITIVE_EXT = {
    ".bak", ".old", ".swp", ".save", ".tmp", ".orig",
    ".sql", ".sqlite", ".db", ".dump",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".tar.gz",
    ".log", ".key", ".pem", ".crt", ".cer", ".pfx",
}


# ---------- Models ----------
class ScanRequest(BaseModel):
    url: str
    recursive: bool = True
    max_depth: int = 3
    max_items: int = 100000
    hide_folders: bool = True
    folder_patterns: List[str] = Field(default_factory=lambda: [])  # substrings to ignore
    hide_extensions: bool = False
    ext_patterns: List[str] = Field(default_factory=lambda: [])     # like ['.php', '.log']
    hide_all_files: bool = False
    output_format: str = "tree"  # tree | uml | md | json | txt


class ScanNode(BaseModel):
    name: str
    type: str  # 'dir' | 'file' | 'parent'
    size: Optional[str] = None
    modified: Optional[str] = None
    url: str
    sensitive: bool = False
    children: List["ScanNode"] = Field(default_factory=list)
    error: Optional[str] = None


ScanNode.model_rebuild()


class ScanResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    duration_ms: int = 0
    total_items: int = 0
    total_dirs: int = 0
    total_files: int = 0
    sensitive_count: int = 0
    sensitive_findings: List[dict] = Field(default_factory=list)
    root: ScanNode
    rendered: str = ""


class HistoryItem(BaseModel):
    id: str
    url: str
    started_at: datetime
    total_items: int
    total_dirs: int
    total_files: int
    sensitive_count: int


# ---------- Scanner ----------
def _is_sensitive(name: str) -> bool:
    lname = name.lower().strip("/")
    if lname in SENSITIVE_NAMES:
        return True
    for ext in SENSITIVE_EXT:
        if lname.endswith(ext):
            return True
    if lname.startswith(".") and lname not in {".", ".."}:
        return True
    return False


def _parse_listing(html: str, base_url: str) -> List[ScanNode]:
    """Parse standard Apache / Nginx / LiteSpeed directory listings."""
    soup = BeautifulSoup(html, "lxml")
    nodes: List[ScanNode] = []
    seen = set()

    # Try table-based listings first (LiteSpeed, Apache fancy index, Nginx fancy)
    rows = soup.select("table tr")
    if rows:
        for tr in rows:
            link = tr.find("a")
            if not link or not link.get("href"):
                continue
            href = link.get("href").strip()
            name = (link.get_text() or href).strip()
            if href in ("../", "/", "?C=N;O=D", "?C=N;O=A", "?C=M;O=A", "?C=M;O=D", "?C=S;O=A", "?C=S;O=D", "?C=D;O=A", "?C=D;O=D"):
                continue
            if href.startswith("?") or href.startswith("#"):
                continue
            if name.lower().strip().rstrip("/") in ("parent directory", "..", "name", "last modified", "size", "description"):
                continue
            tds = tr.find_all("td")
            modified = None
            size = None
            if len(tds) >= 3:
                # heuristics: find a date-like and a size-like cell
                for td in tds:
                    txt = td.get_text(strip=True)
                    if re.search(r"\d{4}-\d{2}-\d{2}", txt) or re.search(r"\d{2}-[A-Za-z]{3}-\d{4}", txt):
                        modified = txt
                    elif re.match(r"^[\d\.]+\s*[KMGT]?$", txt) or txt == "-" or re.match(r"^\d+$", txt):
                        if size is None:
                            size = txt
            is_dir = href.endswith("/") or name.endswith("/")
            full_url = urljoin(base_url, href)
            display = unquote(name).rstrip("/")
            if not display or display in seen:
                continue
            seen.add(display)
            nodes.append(ScanNode(
                name=display + ("/" if is_dir else ""),
                type="dir" if is_dir else "file",
                size=size,
                modified=modified,
                url=full_url,
                sensitive=_is_sensitive(display),
            ))
        if nodes:
            return nodes

    # Fallback: pre-formatted listings (classic Apache)
    pre = soup.find("pre")
    if pre:
        for link in pre.find_all("a"):
            href = link.get("href", "").strip()
            name = (link.get_text() or href).strip()
            if not href or href in ("../", "/") or href.startswith("?") or href.startswith("#"):
                continue
            is_dir = href.endswith("/")
            full_url = urljoin(base_url, href)
            display = unquote(name).rstrip("/")
            if not display or display in seen:
                continue
            seen.add(display)
            # try to extract trailing date/size from tail text after the anchor
            tail = ""
            sib = link.next_sibling
            if sib and isinstance(sib, str):
                tail = sib.strip()
            m = re.match(r"(\S+\s+\S+)\s+(\S+)\s*$", tail)
            modified = m.group(1) if m else None
            size = m.group(2) if m else None
            nodes.append(ScanNode(
                name=display + ("/" if is_dir else ""),
                type="dir" if is_dir else "file",
                size=size,
                modified=modified,
                url=full_url,
                sensitive=_is_sensitive(display),
            ))
        if nodes:
            return nodes

    # Last fallback: plain <a> hrefs
    for link in soup.find_all("a"):
        href = (link.get("href") or "").strip()
        name = (link.get_text() or href).strip()
        if not href or href.startswith("?") or href.startswith("#") or href.startswith("mailto:"):
            continue
        if href.startswith("http") and not href.startswith(base_url.split("?")[0]):
            continue
        if href in ("../", "/"):
            continue
        is_dir = href.endswith("/")
        full_url = urljoin(base_url, href)
        display = unquote(name).rstrip("/")
        if not display or display in seen:
            continue
        seen.add(display)
        nodes.append(ScanNode(
            name=display + ("/" if is_dir else ""),
            type="dir" if is_dir else "file",
            size=None,
            modified=None,
            url=full_url,
            sensitive=_is_sensitive(display),
        ))
    return nodes


async def _fetch(client_http: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        r = await client_http.get(url, follow_redirects=True, timeout=15.0)
        ct = r.headers.get("content-type", "")
        if r.status_code == 200 and ("html" in ct.lower() or "<html" in r.text[:500].lower()):
            return r.text
    except Exception as e:
        logging.warning(f"fetch error {url}: {e}")
    return None


def _should_skip_folder(name: str, patterns: List[str]) -> bool:
    if not patterns:
        return False
    n = name.rstrip("/").lower()
    for p in patterns:
        p = p.strip().lower()
        if p and p in n:
            return True
    return False


def _matches_extension(name: str, exts: List[str]) -> bool:
    n = name.lower()
    for ext in exts:
        ext = ext.strip().lower()
        if not ext:
            continue
        if not ext.startswith("."):
            ext = "." + ext
        if n.endswith(ext):
            return True
    return False


async def _crawl(req: ScanRequest) -> ScanResult:
    start = datetime.now(timezone.utc)
    total = {"items": 0, "dirs": 0, "files": 0, "sensitive": 0}
    sensitive_findings: List[dict] = []

    headers = {"User-Agent": "DIRMAP-WEB/0.2 (+web-scanner)"}
    async with httpx.AsyncClient(headers=headers, verify=False) as http:
        root_html = await _fetch(http, req.url)
        root_node = ScanNode(
            name=urlparse(req.url).path or req.url,
            type="dir",
            url=req.url,
        )
        if root_html is None:
            root_node.error = "Não foi possível obter listagem (página não é um Index Of, requer auth, ou bloqueada)."
            return ScanResult(
                url=req.url,
                root=root_node,
                duration_ms=int((datetime.now(timezone.utc) - start).total_seconds() * 1000),
            )

        async def walk(node: ScanNode, depth: int):
            if total["items"] >= req.max_items:
                return
            html = await _fetch(http, node.url)
            if html is None:
                return
            children = _parse_listing(html, node.url)
            filtered: List[ScanNode] = []
            for c in children:
                if total["items"] >= req.max_items:
                    break
                if c.type == "dir":
                    if req.hide_folders and _should_skip_folder(c.name, req.folder_patterns):
                        continue
                else:
                    if req.hide_all_files:
                        continue
                    if req.hide_extensions and _matches_extension(c.name, req.ext_patterns):
                        continue
                filtered.append(c)
                total["items"] += 1
                if c.type == "dir":
                    total["dirs"] += 1
                else:
                    total["files"] += 1
                if c.sensitive:
                    total["sensitive"] += 1
                    sensitive_findings.append({
                        "name": c.name,
                        "url": c.url,
                        "type": c.type,
                    })

            node.children = filtered

            if req.recursive and depth < req.max_depth:
                # crawl subdirs in parallel (small concurrency)
                sem = asyncio.Semaphore(8)

                async def visit(child):
                    async with sem:
                        await walk(child, depth + 1)

                await asyncio.gather(*(visit(c) for c in filtered if c.type == "dir"))

        await walk(root_node, 0)

    elapsed = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    result = ScanResult(
        url=req.url,
        root=root_node,
        duration_ms=elapsed,
        total_items=total["items"],
        total_dirs=total["dirs"],
        total_files=total["files"],
        sensitive_count=total["sensitive"],
        sensitive_findings=sensitive_findings,
    )
    result.rendered = render_output(result, req.output_format)
    return result


# ---------- Renderers ----------
def render_tree(node: ScanNode, prefix: str = "", is_last: bool = True, is_root: bool = True) -> str:
    lines = []
    if is_root:
        lines.append(f"{node.name}")
        new_prefix = ""
    else:
        connector = "└── " if is_last else "├── "
        marker = " 🔒" if node.sensitive else ""
        meta = ""
        if node.size and node.size != "-":
            meta = f"  ({node.size})"
        lines.append(f"{prefix}{connector}{node.name}{meta}{marker}")
        new_prefix = prefix + ("    " if is_last else "│   ")
    children = node.children
    for i, c in enumerate(children):
        last = i == len(children) - 1
        lines.append(render_tree(c, new_prefix, last, False))
    return "\n".join(l for l in lines if l)


def render_uml(node: ScanNode) -> str:
    out = ["@startuml", "skinparam packageStyle rectangle", ""]

    def rec(n: ScanNode, indent: int):
        pad = "  " * indent
        if n.type == "dir":
            out.append(f'{pad}package "{n.name}" {{')
            for c in n.children:
                rec(c, indent + 1)
            out.append(f"{pad}}}")
        else:
            tag = " <<sensitive>>" if n.sensitive else ""
            out.append(f'{pad}file "{n.name}"{tag}')

    rec(node, 0)
    out.append("@enduml")
    return "\n".join(out)


def render_markdown(node: ScanNode, level: int = 0) -> str:
    lines = []

    def rec(n: ScanNode, lvl: int):
        bullet = "  " * lvl + "- "
        flag = " 🔒" if n.sensitive else ""
        meta = f" *({n.size})*" if n.size and n.size != "-" else ""
        if n.type == "dir":
            lines.append(f"{bullet}**{n.name}**{flag}")
        else:
            lines.append(f"{bullet}{n.name}{meta}{flag}")
        for c in n.children:
            rec(c, lvl + 1)

    rec(node, level)
    return "\n".join(lines)


def render_json(node: ScanNode) -> str:
    import json
    def to_dict(n: ScanNode):
        return {
            "name": n.name,
            "type": n.type,
            "url": n.url,
            "size": n.size,
            "modified": n.modified,
            "sensitive": n.sensitive,
            "children": [to_dict(c) for c in n.children],
        }
    return json.dumps(to_dict(node), indent=2, ensure_ascii=False)


def render_txt(node: ScanNode) -> str:
    lines = []
    def rec(n: ScanNode, indent: int):
        pad = "  " * indent
        flag = " [SENS]" if n.sensitive else ""
        lines.append(f"{pad}{n.name}{flag}")
        for c in n.children:
            rec(c, indent + 1)
    rec(node, 0)
    return "\n".join(lines)


def render_output(result: ScanResult, fmt: str) -> str:
    fmt = (fmt or "tree").lower()
    if fmt in ("tree", "uml/tree", "uml"):
        if fmt == "uml":
            return render_uml(result.root)
        return render_tree(result.root)
    if fmt == "md":
        return render_markdown(result.root)
    if fmt == "json":
        return render_json(result.root)
    if fmt == "txt":
        return render_txt(result.root)
    return render_tree(result.root)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"app": "DIR MAP WEB", "version": "0.2"}


@api_router.post("/scan", response_model=ScanResult)
async def scan(req: ScanRequest):
    if not req.url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "URL deve começar com http:// ou https://")
    result = await _crawl(req)

    # persist
    doc = result.model_dump()
    doc["started_at"] = doc["started_at"].isoformat()
    await db.scans.insert_one(doc)
    return result


@api_router.get("/history", response_model=List[HistoryItem])
async def list_history(limit: int = 50):
    items = await db.scans.find(
        {},
        {"_id": 0, "id": 1, "url": 1, "started_at": 1,
         "total_items": 1, "total_dirs": 1, "total_files": 1, "sensitive_count": 1}
    ).sort("started_at", -1).to_list(limit)
    for it in items:
        if isinstance(it.get("started_at"), str):
            it["started_at"] = datetime.fromisoformat(it["started_at"])
    return items


@api_router.get("/history/{scan_id}", response_model=ScanResult)
async def get_history_item(scan_id: str):
    doc = await db.scans.find_one({"id": scan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Scan não encontrado")
    if isinstance(doc.get("started_at"), str):
        doc["started_at"] = datetime.fromisoformat(doc["started_at"])
    return doc


@api_router.delete("/history/{scan_id}")
async def delete_history_item(scan_id: str):
    r = await db.scans.delete_one({"id": scan_id})
    return {"deleted": r.deleted_count}


@api_router.post("/render")
async def render(payload: dict):
    """Re-render an existing scan tree in a different format without rescanning."""
    fmt = payload.get("format", "tree")
    root_data = payload.get("root")
    if not root_data:
        raise HTTPException(400, "root é obrigatório")
    root = ScanNode(**root_data)
    fake = ScanResult(url="", root=root)
    return {"rendered": render_output(fake, fmt)}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
