import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Rutas standalone lazy (no arrastran la stack 3D del directo ni viceversa):
// /orgullo = escena 2D papercraft; /libreta = el juego de nave (e-notebook,
// suena la canción libreta); /outro = collage de UAPs a pantalla completa.
// nginx hace fallback de todas a index.html.
const OrgulloScene = lazy(() => import("./scenes/orgullo/OrgulloScene"));
const LibretaGame = lazy(() => import("./scenes/envidia/EnvidiaScene"));
const OutroScene = lazy(() => import("./scenes/outro/OutroScene"));

const path = window.location.pathname.replace(/\/+$/, "");
const hash = window.location.hash;
const isOrgullo = path === "/orgullo" || hash === "#/orgullo";
const isLibreta = path === "/libreta" || hash === "#/libreta";
const isOutro = path === "/outro" || hash === "#/outro";
const isRoute = isOrgullo || isLibreta || isOutro;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isRoute ? (
      <Suspense fallback={<div className="route-loading mono">loading…</div>}>
        {isOrgullo ? <OrgulloScene /> : isLibreta ? <LibretaGame /> : <OutroScene />}
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
