import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth-shell';

export default function SignInPage() {
  return (
    <AuthShell
      title="Bem-vindo de volta."
      description="Entra para rever pedidos pendentes e emitir faturas direto da inbox."
    >
      <SignIn appearance={{ elements: { rootBox: 'mx-auto' } }} />
    </AuthShell>
  );
}
