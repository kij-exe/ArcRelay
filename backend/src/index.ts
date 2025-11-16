import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallets';
import balanceRoutes from './routes/balances';
import transactionRoutes from './routes/transactions';
import gatewayRoutes from './routes/gateway';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/gateway', gatewayRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

