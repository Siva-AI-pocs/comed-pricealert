import AuthForm from "./AuthForm.jsx";
import "./AuthModal.css";

export default function AuthModal({ open, onClose, initialMode = "login" }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <AuthForm initialMode={initialMode} onSuccess={onClose} />
      </div>
    </div>
  );
}
