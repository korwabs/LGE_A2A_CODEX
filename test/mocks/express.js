function createApp() {
  return {
    use: () => {},
    post: () => {},
    get: () => {},
  };
}

function Router() {
  return {
    use: () => {},
    post: () => {},
    get: () => {},
  };
}

createApp.Router = Router;
createApp.json = () => (req, res, next) => next();
module.exports = createApp;
