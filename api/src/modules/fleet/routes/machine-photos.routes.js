import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.machine_photos',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.machine_photos);
  },
};
