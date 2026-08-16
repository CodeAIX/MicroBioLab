import { expect, test } from "@playwright/test";

test("published sample opens inside the sandboxed experiment frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /探索微观世界/ })).toBeVisible();
  await expect(page.getByText("肠道杆菌的分离培养与生化鉴定", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /进入实验/ }).click();
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText("肠道杆菌的分离培养与生化鉴定").first()).toBeVisible();
  await expect(frame.getByText("虚拟仿真实验").first()).toBeVisible();
});

test("administrator can log in and see the immutable version", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("IntegrationTest-Password-2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
  await page.getByRole("link", { name: /实验管理/ }).click();
  await page.getByRole("link", { name: /管理/ }).click();
  await expect(page.getByText("v000001", { exact: true })).toBeVisible();
});
