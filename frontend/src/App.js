import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DirMap from "@/pages/DirMap";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DirMap />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

export default App;
