import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { Participar } from "./Participar";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Participar />
  </StrictMode>,
);
