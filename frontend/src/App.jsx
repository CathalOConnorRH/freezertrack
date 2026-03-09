import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ScanLine, PlusCircle, Archive } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import AddItem from "./pages/AddItem";
import Inventory from "./pages/Inventory";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scanner", icon: ScanLine },
  { to: "/add", label: "Add Item", icon: PlusCircle },
  { to: "/inventory", label: "Inventory", icon: Archive },
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--navy)] text-white p-4 fixed h-full">
        <div className="mb-8 px-4">
          <h1 className="text-xl font-bold tracking-tight">FreezerTrack</h1>
          <p className="text-xs text-gray-400 mt-1">Freezer Inventory</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-60 pb-20 md:pb-6 p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scan" element={<Scanner />} />
          <Route path="/add" element={<AddItem />} />
          <Route path="/inventory" element={<Inventory />} />
        </Routes>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 z-50">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs ${
                active ? "text-[var(--ice-blue)]" : "text-gray-400"
              }`}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
