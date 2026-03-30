const { z } = require('zod');

const createUserSchema = z.object({
  name: z.string().min(1, 'name is required'),
  email: z.string().min(1, 'email is required').email('email must be a valid email address'),
});

module.exports = { createUserSchema };
