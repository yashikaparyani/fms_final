import { useState } from "react";
import api from "../../api";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

const REPORTS = [
  { type: "loads", title: "Loads Report", description: "Load lifecycle, customer, assignment, and transport status." },
  { type: "bids", title: "Bids Report", description: "Bid amounts, ranking status, fleet-owner rating, and submitted date." },
  { type: "ratings", title: "Ratings Report", description: "Staff ratings used in the 30% past-performance bid score." },
];

const ReportsPage = () => {
  const [downloading, setDownloading] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const downloadReport = async (type) => {
    try {
      setDownloading(type);

      const res = await api.get(`/stats/reports/download`, {
        params: {
          type,
          startDate,
          endDate,
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute(
        "download",
        `${type}-report-${startDate || "all"}-to-${endDate || "all"}.csv`
      );

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading("");
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* HEADER */}
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Download operational reports with date filtering
        </p>
      </div>

      {/* DATE FILTER */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col md:flex-row gap-4">
        <div className="flex flex-col w-full">
          <label className="label">Start Date</label>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col w-full">
          <label className="label">End Date</label>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* REPORT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
          <div key={report.type} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-800">
                <AssessmentOutlinedIcon />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">{report.title}</h2>
                <p className="text-xs text-gray-500">{report.description}</p>
              </div>
            </div>

            <button
              onClick={() => downloadReport(report.type)}
              disabled={downloading === report.type}
              className="btn-primary w-full justify-center"
            >
              <DownloadOutlinedIcon fontSize="small" />
              {downloading === report.type ? "Preparing..." : "Download CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsPage;