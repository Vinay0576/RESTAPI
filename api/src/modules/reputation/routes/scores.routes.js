import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'reputation.scores',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.scores);
  },
};
