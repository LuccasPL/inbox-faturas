import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth-shell';

export default function SignUpPage() {
  return (
    <AuthShell
      title="Pedidos por email viram faturas em segundos."
      description="Cria a conta e fecha o setup em menos de 10 minutos. O resto é só rever drafts."
    >
      <SignUp appearance={{ elements: { rootBox: 'mx-auto' } }} />
    </AuthShell>
  );
}
