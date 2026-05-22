import { z } from "zod";

const emailInputSchema = z.string().trim().email().transform((value) => value.toLowerCase());
const passwordInputSchema = z.string().min(12).max(256);

export const authUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  id: z.string().trim().min(1)
});

export const signupInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  email: emailInputSchema,
  password: passwordInputSchema
});

export const loginInputSchema = z.object({
  email: emailInputSchema,
  password: passwordInputSchema
});

export const passwordResetRequestInputSchema = z.object({
  email: emailInputSchema
});

export const authResponseSchema = z.object({
  session: z.object({
    expiresAt: z.coerce.date()
  }),
  user: authUserSchema
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestInputSchema
>;
export type SignupInput = z.infer<typeof signupInputSchema>;

export function parseLoginInput(input: unknown): LoginInput {
  return loginInputSchema.parse(input);
}

export function parsePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return passwordResetRequestInputSchema.parse(input);
}

export function parseSignupInput(input: unknown): SignupInput {
  return signupInputSchema.parse(input);
}
