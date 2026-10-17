import type { Request, Response } from 'express';
import { matchesEtag, weakEtag } from './cursor';

export function respondJson(
  req: Request,
  res: Response,
  status: number,
  body: unknown,
  withEtag: boolean,
): void {
  if (!withEtag) {
    res.status(status).json(body);
    return;
  }
  const etag = weakEtag(JSON.stringify(body));
  res.setHeader('ETag', etag);
  if (status === 200 && matchesEtag(req.header('if-none-match'), etag)) {
    res.status(304).end();
    return;
  }
  res.status(status).json(body);
}
