import Swal from "sweetalert2";

// Toast-style mixin (non-blocking, top-right corner)
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export const notify = {
  success: (msg) => Toast.fire({ icon: "success", title: msg }),
  error: (msg) => Toast.fire({ icon: "error", title: msg }),
  warning: (msg) => Toast.fire({ icon: "warning", title: msg }),
  info: (msg, timer = 3000) => Toast.fire({ icon: "info", title: msg, timer }),
};

export default Swal;
