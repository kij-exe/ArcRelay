import { Router, Response } from 'express';
import { z } from 'zod';
import { addUser, getUserByEmail } from '../db/connection';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { validate } from '../middleware/validation';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', validate(registerSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const password_hash = await hashPassword(password);
    const user = await addUser({ email, password_hash });

    const token = generateToken({ userUuid: user.uuid, email: user.email });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { uuid: user.uuid, email: user.email },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({ userUuid: user.uuid, email: user.email });

    res.json({
      message: 'Login successful',
      token,
      user: { uuid: user.uuid, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

export default router;

