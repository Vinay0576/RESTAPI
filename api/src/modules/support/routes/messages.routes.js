import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.messages',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.messages);
  },
};
