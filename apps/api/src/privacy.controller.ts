import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { PrivacyService } from "@fluentcoach/application";
import type { Response } from "express";
import { z } from "zod";
import { AuthGuard, type AuthRequest } from "./auth.guard.js";
import { CsrfGuard } from "./csrf.guard.js";
import { SESSION_STORE, type SessionStore } from "./session.js";
const requestInput = z.object({ requestKey: z.uuid() }).strict();
@Controller("api/v1/privacy")
@UseGuards(AuthGuard)
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
  ) {}
  @Post("exports") @UseGuards(CsrfGuard) export(
    @Req() r: AuthRequest,
    @Body() raw: unknown,
  ) {
    return this.privacy.export(
      r.accountId!,
      requestInput.parse(raw).requestKey,
    );
  }
  @Get("exports/:id") status(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.privacy.status(r.accountId!, z.uuid().parse(id));
  }
  @Get("exports/:id/download") async download(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const content = await this.privacy.download(
      r.accountId!,
      z.uuid().parse(id),
    );
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader(
      "content-disposition",
      'attachment; filename="fluentcoach-datos.json"',
    );
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.send(content);
  }
  @Post("deletion") @UseGuards(CsrfGuard) async delete(
    @Req() r: AuthRequest,
    @Body() raw: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = requestInput
      .extend({ confirmed: z.literal(true) })
      .parse(raw);
    await this.privacy.delete(r.accountId!, input.requestKey, input.confirmed); // Canonical revocation has committed before Redis cleanup.
    try {
      await this.sessions.delete(r.sessionId!);
    } catch {
      /* TTL key is powerless against DELETING. */
    }
    res.clearCookie("fc_session", { path: "/" });
    return {
      state: "deleting",
      message: "La eliminación ha comenzado. Se ha cerrado tu sesión.",
    };
  }
}
