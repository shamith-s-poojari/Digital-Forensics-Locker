export default function Toast({ message, type = "info" }) {
  const bgColor = {
    info: "bg-blue-900 border-blue-700 text-blue-400",
    success: "bg-green-900 border-green-700 text-green-400",
    error: "bg-red-900 border-red-700 text-red-400",
    warning: "bg-yellow-900 border-yellow-700 text-yellow-400"
  }[type] || "bg-gray-800 border-gray-700 text-white";

  return (
    <div className={`fixed bottom-4 right-4 border rounded-lg px-4 py-3 ${bgColor} z-50`}>
      {message}
    </div>
  );
}
