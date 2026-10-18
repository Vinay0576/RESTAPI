import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.conversations',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.conversations);
  },
};
