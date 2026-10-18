import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.app_feedback',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.app_feedback);
  },
};
