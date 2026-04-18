/**
 * @openapi
 * components:
 *   schemas:
 *     HealthResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         ts:
 *           type: integer
 *           format: int64
 *           example: 1713373200000
 *     ReadyResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         mongo:
 *           type: string
 *           enum: [connected, disconnected]
 *           example: connected
 *         ts:
 *           type: integer
 *           format: int64
 *           example: 1713373200000
 *     ValidationErrorResponse:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Validation failed
 *         details:
 *           type: array
 *           items:
 *             type: object
 *         requestId:
 *           type: string
 *           example: req_123456
 *     UnauthorizedErrorResponse:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: UNAUTHORIZED
 *         message:
 *           type: string
 *           example: Unauthorized
 *         requestId:
 *           type: string
 *           example: req_123456
 *     RegisterRequest:
 *       type: object
 *       required: [name, email, phone, password]
 *       properties:
 *         name:
 *           type: string
 *           example: Ivan Ivanenko
 *         email:
 *           type: string
 *           format: email
 *           example: ivan@example.com
 *         phone:
 *           type: string
 *           example: "+380501234567"
 *         password:
 *           type: string
 *           format: password
 *           example: secret123
 *         confirmPassword:
 *           type: string
 *           format: password
 *           example: secret123
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: ivan@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: secret123
 *     ProductListItem:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *         name:
 *           oneOf:
 *             - type: string
 *             - type: object
 *         slug:
 *           type: string
 *           example: oak-dining-table
 *         price:
 *           type: number
 *           example: 14999
 *         category:
 *           oneOf:
 *             - type: string
 *             - type: object
 *         subCategory:
 *           oneOf:
 *             - type: string
 *             - type: object
 *     ProductListResponse:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/ProductListItem'
 */

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [System]
 *     summary: Check process health
 *     responses:
 *       200:
 *         description: Service is reachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */

/**
 * @openapi
 * /api/ready:
 *   get:
 *     tags: [System]
 *     summary: Check MongoDB readiness
 *     responses:
 *       200:
 *         description: Database connection is ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadyResponse'
 *       503:
 *         description: Database connection is not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadyResponse'
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration completed
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login completed
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedErrorResponse'
 */

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedErrorResponse'
 */

/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: Get catalog products
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Free-text search term
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Category slug or name
 *       - in: query
 *         name: subCategory
 *         schema:
 *           type: string
 *         description: Subcategory slug or name
 *     responses:
 *       200:
 *         description: Product list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListResponse'
 */

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a single product by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB object id
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: Product not found
 */

export const swaggerAnnotationModules = true;
