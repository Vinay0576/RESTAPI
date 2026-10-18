import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.offers',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.offers);
  },
};
