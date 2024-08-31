import { ProcessListenerLinux, getLinuxWindows  } from "./dist/index.js";

const listener = new ProcessListenerLinux(["code", "gnome-terminal-server"]);

listener.on("change", window => {
	console.log("Active: ", window)
})



getLinuxWindows().forEach(w => {
	console.log(w)
})


