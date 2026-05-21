import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { useState } from "react";

function Dashboard() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  return (
    <div className="h-screen flex overflow-hidden">

      {/* Sidebar Wrapper (Width controlled here) */}
    <div
        className={` hidden md:block transition-all duration-300 flex-shrink-0 ${
          isMenuOpen ? "w-62 min-w-[12rem] max-w-[12rem]" : "w-20 min-w-[5rem] max-w-[5rem]"
        }`}
      >
        <Sidebar
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
        />
      </div>

      {/* Main Section */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">

        <Topbar isMenuOpen={isMenuOpen} />

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-4 lg:px-2 lg:py-6">
          <Outlet />
        </div>

      </div>
    </div>
  );
}

export default Dashboard;