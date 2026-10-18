import {createGeographyController} from './geography.controller.js';
import regionsRoutes from './routes/regions.routes.js';
import sitesRoutes from './routes/sites.routes.js';

export default {
  domain: 'geography',
  createController: createGeographyController,
  routes: [
    regionsRoutes,
    sitesRoutes,
  ],
};
