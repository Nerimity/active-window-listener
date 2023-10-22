
const {ProcessListener, getWindows} = require("./dist");

const listener = new ProcessListener(["Discord.exe", "Telegram.exe", "Code.exe"]);

listener.on("change", window => {
	console.log("Active: ", window)
})



getWindows().forEach(w => {
	w.getExif().then(tags => {console.log(tags.FileDescription)})
})