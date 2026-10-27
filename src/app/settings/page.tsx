import { PageHeader } from "@/components/ui";
import { getRole } from "@/lib/role";
import { getSettings } from "@/lib/settings";
import { DiscountSettings, PaymentTermsSettings, VatSettings } from "./settings-forms";

export default async function SettingsPage() {
  const [settings, role] = await Promise.all([getSettings(), getRole()]);
  const isManager = role === "manager";

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description={
          isManager
            ? "VAT rate and the discount rates offered on sales orders. Changes apply to new orders only; existing orders keep their prices and discounts."
            : "VAT rate and discount rates in use. Switch to Stock manager to change them."
        }
      />
      <div className="grid gap-6">
        <VatSettings vatRate={settings.vatRate} updatedAt={settings.updatedAt} isManager={isManager} />
        <DiscountSettings tiers={settings.tiers} isManager={isManager} />
        <PaymentTermsSettings customerDays={settings.customerPaymentDays} supplierDays={settings.supplierPaymentDays} isManager={isManager} />
      </div>
    </div>
  );
}
