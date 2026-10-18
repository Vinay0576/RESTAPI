import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.condition_photos',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.condition_photos);
  },
};
