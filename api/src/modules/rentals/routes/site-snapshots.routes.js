import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.site_snapshots',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.site_snapshots);
  },
};
