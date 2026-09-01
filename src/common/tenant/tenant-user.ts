export type TenantUser = {
  id: number;
  username: string;
  businessId: number;
  membershipId: number;
  role: string;
  permissions: string[];
  platformAdmin: boolean;
};
