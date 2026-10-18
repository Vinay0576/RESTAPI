import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.attachment_movements',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_movements);
  },
};
