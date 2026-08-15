import { useEffect, useRef, useState } from "react";
import UndoIcon from "@mui/icons-material/Undo";

// ─── SignaturePad ─────────────────────────────────────────────────────────────
// Draw-with-a-finger-or-mouse signature capture, exported as a PNG data URL and
// stamped into the generated agreement PDF.
//
// Written against pointer events rather than separate mouse and touch handlers:
// carriers sign these on a phone in a yard as often as at a desk, and pointer
// events cover both without the double-fire that mouse+touch listeners produce
// on touchscreens.
// ─────────────────────────────────────────────────────────────────────────────

const SignaturePad = ({ onChange, disabled, height = 150 }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // The canvas is sized in CSS pixels but drawn in device pixels — without the
  // scale, a signature on a phone comes out soft and pixellated in the PDF.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;

    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [height]);

  const pointFrom = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event) => {
    if (disabled) return;
    event.preventDefault();
    // Capture keeps the stroke going when the pointer leaves the canvas
    // mid-signature, which is most signatures on a small screen.
    canvasRef.current.setPointerCapture(event.pointerId);

    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (event) => {
    if (!drawing.current || disabled) return;
    event.preventDefault();

    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pointFrom(event);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (!hasInk) setHasInk(true);
  };

  const end = (event) => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current.releasePointerCapture?.(event.pointerId);
    onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-gray-600">
          Sign here <span className="text-red-500">*</span>
        </label>
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800"
          >
            <UndoIcon style={{ fontSize: 14 }} /> Clear
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        style={{ height, touchAction: "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={`w-full rounded-lg border-2 border-dashed bg-white ${
          hasInk ? "border-indigo-300" : "border-gray-300"
        } ${disabled ? "opacity-50" : "cursor-crosshair"}`}
      />

      <p className="text-[11px] text-gray-500 mt-1">
        Draw your signature with a finger, stylus or mouse. It is stamped onto
        your copy of the agreement.
      </p>
    </div>
  );
};

export default SignaturePad;
