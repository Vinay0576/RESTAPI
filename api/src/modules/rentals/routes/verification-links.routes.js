import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.verification_links',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.verification_links);
  },
};
