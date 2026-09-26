import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "请先通过邀请链接加入这次旅行");
export const forbidden = (msg = "没有权限") => new HttpError(403, msg);
export const notFound = (msg = "找不到") => new HttpError(404, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler so thrown HttpErrors / ZodErrors become JSON error responses. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const first = e.issues[0];
        return Response.json({ error: first ? `${first.path.join(".") || "参数"}：${first.message}` : "参数错误" }, { status: 400 });
      }
      console.error(e);
      return Response.json({ error: "服务器出错了" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("请求格式错误");
  }
  return schema.parse(json);
}

export const ok = (data: unknown = { ok: true }, init?: ResponseInit) => Response.json(data, init);
