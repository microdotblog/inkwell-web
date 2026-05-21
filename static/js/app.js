import { Application } from "./stimulus.js?20260521.3";
import AuthController from "./controllers/auth_controller.js?20260521.3";
import UserMenuController from "./controllers/user_menu_controller.js?20260521.3";
import SessionController from "./controllers/session_controller.js?20260521.3";
import TimelineController from "./controllers/timeline_controller.js?20260521.3";
import ReaderController from "./controllers/reader_controller.js?20260521.3";
import HighlightController from "./controllers/highlight_controller.js?20260521.3";
import HighlightsController from "./controllers/highlights_controller.js?20260521.3";
import SubscriptionsController from "./controllers/subscriptions_controller.js?20260521.3";
import DiscoverController from "./controllers/discover_controller.js?20260521.3";
import ReaderMenuController from "./controllers/reader_menu_controller.js?20260521.3";
import { initThemes } from "./theme_manager.js?20260521.3";
import { init_listener } from "./router.js";

initThemes();
init_listener();

const application = Application.start();
application.register("auth", AuthController);
application.register("user-menu", UserMenuController);
application.register("session", SessionController);
application.register("timeline", TimelineController);
application.register("reader", ReaderController);
application.register("highlight", HighlightController);
application.register("highlights", HighlightsController);
application.register("subscriptions", SubscriptionsController);
application.register("discover", DiscoverController);
application.register("reader-menu", ReaderMenuController);
