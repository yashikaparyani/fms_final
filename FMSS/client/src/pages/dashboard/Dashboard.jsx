import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import MarqueeBanner from "../../components/MarqueeBanner";
import { useState } from "react";

function Dashboard() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  return (
    <div className="h-screen flex overflow-hidden">

      {/* Sidebar Wrapper (Width controlled here) */}
    <div
        className={` hidden md:block transition-all duration-300 flex-shrink-0 ${
          isMenuOpen ? "w-64 min-w-[16rem] max-w-[16rem]" : "w-20 min-w-[5rem] max-w-[5rem]"
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

        {/* Office announcements, under the topbar so every portal and every
            screen shows them. Renders nothing when there are none. */}
        <MarqueeBanner />

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-4 lg:px-2 lg:py-6">
          <Outlet />
        </div>

      </div>
    </div>
  );
}

export default Dashboard;