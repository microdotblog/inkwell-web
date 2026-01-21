import { Application } from "./stimulus.js";
import AuthController from "./controllers/auth_controller.js?20260121.1";
import UserMenuController from "./controllers/user_menu_controller.js?20260121.1";
import SessionController from "./controllers/session_controller.js?20260121.1";
import TimelineController from "./controllers/timeline_controller.js?20260121.1";
import ReaderController from "./controllers/reader_controller.js?20260121.1";
import HighlightController from "./controllers/highlight_controller.js?20260121.1";
import HighlightsController from "./controllers/highlights_controller.js?20260121.1";
import SubscriptionsController from "./controllers/subscriptions_controller.js?20260121.1";

const application = Application.start();
application.register("auth", AuthController);
application.register("user-menu", UserMenuController);
application.register("session", SessionController);
application.register("timeline", TimelineController);
application.register("reader", ReaderController);
application.register("highlight", HighlightController);
application.register("highlights", HighlightsController);
application.register("subscriptions", SubscriptionsController);
