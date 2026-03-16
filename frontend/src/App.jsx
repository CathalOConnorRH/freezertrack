import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ScanLine, PlusCircle, Archive,
  BarChart3, ShoppingCart, Tag, Settings,
} from "lucide-react";
import useTheme from "./hooks/useTheme";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import AddItem from "./pages/AddItem";
import Inventory from "./pages/Inventory";
import Statistics from "./pages/Statistics";
import ShoppingList from "./pages/ShoppingList";
import LabelDesigner from "./pages/LabelDesigner";
import Admin from "./pages/Admin";
import Debug from "./pages/Debug";

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/add", label: "Add", icon: PlusCircle },
  { to: "/inventory", label: "Items", icon: Archive },
  { to: "/shopping", label: "Shop", icon: ShoppingCart },
];

const SIDEBAR_ONLY = [
  { to: "/stats", label: "Statistics", icon: BarChart3 },
  { to: "/labels", label: "Label Designer", icon: Tag },
  { to: "/admin", label: "Admin", icon: Settings },
];

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
          isActive
            ? "bg-[var(--ice-blue)] text-white"
            : "text-gray-300 hover:bg-white/10"
        }`
      }
    >
      <Icon size={20} />
      <span className="text-sm font-medium">{label}</span>
    </NavLink>
  );
}

export default function App() {
  const location = useLocation();
  useTheme();

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--navy)] text-white p-4 fixed h-full z-40">
        <div className="mb-8 px-4">
          <h1 className="text-xl font-bold tracking-tight">FreezerTrack</h1>
          <p className="text-xs text-gray-400 mt-1">Freezer Inventory</p>
        </div>
        <nav aria-label="Main navigation" className="flex flex-col gap-1 flex-1">
          {[...NAV, ...SIDEBAR_ONLY].map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 bg-[var(--navy)] text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">FreezerTrack</h1>
        <div className="flex gap-3">
          <NavLink to="/stats" aria-label="Statistics" className={({ isActive }) => isActive ? "text-[var(--ice-blue)]" : "text-gray-400"}>
            <BarChart3 size={20} />
          </NavLink>
          <NavLink to="/labels" aria-label="Label Designer" className={({ isActive }) => isActive ? "text-[var(--ice-blue)]" : "text-gray-400"}>
            <Tag size={20} />
          </NavLink>
          <NavLink to="/admin" aria-label="Admin Settings" className={({ isActive }) => isActive ? "text-[var(--ice-blue)]" : "text-gray-400"}>
            <Settings size={20} />
          </NavLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 md:ml-60 pb-24 md:pb-8 px-4 py-4 md:px-8 md:py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scan" element={<Scanner />} />
          <Route path="/add" element={<AddItem />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/stats" element={<Statistics />} />
          <Route path="/labels" element={<LabelDesigner />} />
          <Route path="/shopping" element={<ShoppingList />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/debug" element={<Debug />} />
        </Routes>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] flex justify-around px-1 pt-2 safe-bottom z-50">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 min-w-[3.5rem] py-1.5 text-[10px] font-medium rounded-lg transition-colors ${
                active ? "text-[var(--ice-blue)]" : "text-gray-400"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
