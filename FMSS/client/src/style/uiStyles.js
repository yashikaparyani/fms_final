export const uiStyles = {
  // Layout
  page: "space-y-6",
  card: "bg-white rounded-xl shadow-sm p-6 border border-gray-200",
  cardHeader: "flex items-center justify-between mb-4",
weekleyGrid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-2 mt-6 break-words lg:whitespace-nowrap",
  quickActionGrid: "grid grid-cols-2 gap-6 mt-3",
  grid4: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6",
  grid2: "grid grid-cols-1 lg:grid-cols-2 gap-6",

  // Inputs
  input:
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
  
  inputError:
    "border-red-500 focus:ring-red-500 focus:border-red-500",

  select:
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500",

  textarea:
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",

  label: "block text-sm font-medium text-gray-700 mb-1.5",

  // Table/List items
  listItem:
    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",

  // Flex helpers
  flexBetween: "flex items-center justify-between",
  flexCenter: "flex items-center justify-center",

  // Text
  title: "text-lg font-semibold text-gray-700",
  subtitle: "text-sm text-gray-500",

  // Status colors (map-based)
  statusColor: {
    green: "text-green-600",
    red: "text-red-600",
    yellow: "text-yellow-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
  },
};