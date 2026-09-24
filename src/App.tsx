import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Icon } from "./components/Icons";
import { useSettings } from "./lib/settings";
import { syncWithServer } from "./lib/sync";
import { DialogHost } from "./components/Dialog";
import { closeOpenViewer } from "./components/ImageViewer";
import { installBackButton, requestPersistentStorage, useOnline, webPreview } from "./lib/platform";
import { onPwaEvent, applyPwaUpdate } from "./pwa";
import { installBundledIfEmpty } from "./lib/library";
import Home from "./pages/Home";
import Library from "./pages/Library";
import ImportPage from "./pages/Import";
import QuizSetup from "./pages/QuizSetup";
import QuizRunner from "./pages/QuizRunner";
import Results from "./pages/Results";
import History from "./pages/History";
import Flashcards from "./pages/Flashcards";
import Cases from "./pages/Cases";
import CaseView from "./pages/CaseView";
import SearchPage from "./pages/Search";
import Tagging from "./pages/Tagging";
import Stats from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import QuestionPage from "./pages/QuestionPage";
import AnswerCheck from "./pages/AnswerCheck";
import MockExam from "./pages/MockExam";
import ImageAtlas from "./pages/ImageAtlas";
import ReferencePage from "./components/Reference";
import { SECTION_HUE } from "./lib/colors";

const NAV = [
  { to: "/", label: "Home", icon: Icon.home, end: true, mobile: true },
  { to: "/library", label: "Library", icon: Icon.book, mobile: false },
  { to: "/quiz", label: "Tests", icon: Icon.quiz, mobile: true },
  { to: "/mock", label: "Mock exam", icon: Icon.timer, mobile: false },
  { to: "/flashcards", label: "Flashcards", icon: Icon.cards, mobile: true },
  { to: "/cases", label: "Cases", icon: Icon.cases, mobile: true },
  { to: "/search", label: "Search", icon: Icon.search, mobile: true },
  { to: "/atlas", label: "Image atlas", icon: Icon.image, mobile: false },
  { to: "/reference", label: "Lab values & scales", icon: Icon.lab, mobile: false },
  { to: "/tagging", label: "AI tagging", icon: Icon.tag, mobile: false },
  { to: "/answer-check", label: "Answer check", icon: Icon.sparkle, mobile: false },
  { to: "/history", label: "History", icon: Icon.history, mobile: false },
  { to: "/stats", label: "Statistics", icon: Icon.stats, mobile: false },
  { to: "/import", label: "Import", icon: Icon.upload, mobile: false },
  { to: "/settings", label: "Settings", icon: Icon.settings, mobile: false }
];

export default function App() {
  const settings = useSettings();
  const online = useOnline();
  const [pwa, setPwa] = useState<"" | "offline-ready" | "update">("");
  const [setup, setSetup] = useState("");

  // First launch: copy the books that ship with the app into the library.
  useEffect(() => {
    installBundledIfEmpty(setSetup)
      .catch((e) => setSetup(`Could not set up the built-in books: ${(e as Error).message}`))
      .then((ran) => ran !== undefined && setSetup(""));
  }, []);

  useEffect(() => {
    requestPersistentStorage();
    installBackButton(closeOpenViewer);
    return onPwaEvent(setPwa);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    root.style.setProperty("--font-scale", String(settings.fontScale));
  }, [settings.theme, settings.fontScale]);

  // Background sync every 5 minutes and when the app regains focus.
  useEffect(() => {
    if (!settings.syncUrl) return;
    // offline changes stay queued locally and go out on the next sync
    const run = () => navigator.onLine && syncWithServer().catch(() => undefined);
    run();
    const t = setInterval(run, 5 * 60_000);
    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", run);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", run);
    };
  }, [settings.syncUrl, settings.syncToken]);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="./icon.svg" alt="" /> NeuroQuiz
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" style={{ ["--h" as string]: SECTION_HUE[n.to] ?? 212 }}>
            <span className="nav-ico">
              <n.icon />
            </span>{" "}
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        {webPreview && (
          <div className="banner accent small">
            Web preview: your books and progress are saved in this browser only. Install the Windows or Android app to keep them for real use and to export.
          </div>
        )}
        {setup && <div className="banner accent">Setting up your library: {setup}</div>}
        {!online && <div className="banner">Offline – everything works except AI features and sync, which resume when you reconnect.</div>}
        {pwa === "update" && (
          <div className="banner accent">
            A new version is ready.{" "}
            <button className="small primary" onClick={applyPwaUpdate}>
              Update now
            </button>{" "}
            <button className="small" onClick={() => setPwa("")}>
              Later
            </button>
          </div>
        )}
        {pwa === "offline-ready" && (
          <div className="banner good">
            Installed for offline use.{" "}
            <button className="small" onClick={() => setPwa("")}>
              OK
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/quiz" element={<QuizSetup />} />
          <Route path="/quiz/:id" element={<QuizRunner />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="/history" element={<History />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseView />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/question/:id" element={<QuestionPage />} />
          <Route path="/tagging" element={<Tagging />} />
          <Route path="/answer-check" element={<AnswerCheck />} />
          <Route path="/mock" element={<MockExam />} />
          <Route path="/atlas" element={<ImageAtlas />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/reference" element={<ReferencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <DialogHost />
      <nav className="bottom-nav" aria-label="Main mobile">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" style={{ ["--h" as string]: SECTION_HUE[n.to] ?? 212 }}>
            <span className="nav-ico">
              <n.icon size={20} />
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
