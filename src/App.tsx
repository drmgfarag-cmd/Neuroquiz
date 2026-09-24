import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Icon } from "./components/Icons";
import { useSettings } from "./lib/settings";
import { syncWithServer } from "./lib/sync";
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

const NAV = [
  { to: "/", label: "Home", icon: Icon.home, end: true, mobile: true },
  { to: "/library", label: "Library", icon: Icon.book, mobile: false },
  { to: "/quiz", label: "Tests", icon: Icon.quiz, mobile: true },
  { to: "/flashcards", label: "Flashcards", icon: Icon.cards, mobile: true },
  { to: "/cases", label: "Cases", icon: Icon.cases, mobile: true },
  { to: "/search", label: "Search", icon: Icon.search, mobile: true },
  { to: "/tagging", label: "AI tagging", icon: Icon.tag, mobile: false },
  { to: "/history", label: "History", icon: Icon.history, mobile: false },
  { to: "/stats", label: "Statistics", icon: Icon.stats, mobile: false },
  { to: "/import", label: "Import", icon: Icon.upload, mobile: false },
  { to: "/settings", label: "Settings", icon: Icon.settings, mobile: false }
];

export default function App() {
  const settings = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    root.style.setProperty("--font-scale", String(settings.fontScale));
  }, [settings.theme, settings.fontScale]);

  // Background sync every 5 minutes and when the app regains focus.
  useEffect(() => {
    if (!settings.syncUrl) return;
    const run = () => syncWithServer().catch(() => undefined);
    run();
    const t = setInterval(run, 5 * 60_000);
    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [settings.syncUrl, settings.syncToken]);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="./icon.svg" alt="" /> NeuroQuiz
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
            <n.icon /> {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
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
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Main mobile">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
            <n.icon size={20} /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
