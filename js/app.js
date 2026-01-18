import { Application } from "./stimulus.js";
import AuthController from "./controllers/auth_controller.js?2";
import SessionController from "./controllers/session_controller.js?2";
import TimelineController from "./controllers/timeline_controller.js?2";
import ReaderController from "./controllers/reader_controller.js?2";
import HighlightController from "./controllers/highlight_controller.js?2";
import CanvasController from "./controllers/canvas_controller.js?2";

const application = Application.start();
application.register("auth", AuthController);
application.register("session", SessionController);
application.register("timeline", TimelineController);
application.register("reader", ReaderController);
application.register("highlight", HighlightController);
application.register("canvas", CanvasController);
