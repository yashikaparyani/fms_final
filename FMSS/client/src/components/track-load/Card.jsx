const Card = ({ children, className = "", style = {} }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 ${className}`}
    style={style}
  >
    {children}
  </div>
);

export default Card;