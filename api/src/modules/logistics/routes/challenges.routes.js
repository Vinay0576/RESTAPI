import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.challenges',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.challenges);
  },
};
