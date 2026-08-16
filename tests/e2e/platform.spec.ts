import { expect, test } from "@playwright/test";

test("published sample opens inside the sandboxed experiment frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /探索微观世界/ })).toBeVisible();
  await expect(page.getByText("肠道杆菌的分离培养与生化鉴定", { exact: true })).toBeVisible();
  await page.locator(".experiment-card").filter({ hasText: "肠道杆菌的分离培养与生化鉴定" }).getByRole("link", { name: /查看实验介绍/ }).click();
  await expect(page).toHaveURL(/\/experiments\/enterobacteria-identification$/);
  await expect(page.getByRole("heading", { name: "实验简介" })).toBeVisible();
  await expect(page.getByRole("img", { name: "实验二维码" })).toBeVisible();
  await page.getByRole("link", { name: /开始虚拟实验/ }).click();
  await expect(page).toHaveURL(/\/experiments\/enterobacteria-identification\/run$/);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText("肠道杆菌的分离培养与生化鉴定").first()).toBeVisible();
  await expect(frame.getByText("虚拟仿真实验").first()).toBeVisible();
});

test("administrator can log in and preview the immutable version", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("IntegrationTest-Password-2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
  await page.getByRole("link", { name: "▤ 实验管理", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "肠道杆菌的分离培养与生化鉴定" }).getByRole("link", { name: "管理 →", exact: true }).click();
  await expect(page.getByText("v000001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  const frame = page.frameLocator('iframe[title="管理员预览"]');
  await expect(frame.getByText("肠道杆菌的分离培养与生化鉴定").first()).toBeVisible();
});

test("administrator can upload a new version without a stale form error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("IntegrationTest-Password-2026");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByRole("link", { name: "▤ 实验管理", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "肠道杆菌的分离培养与生化鉴定" }).getByRole("link", { name: "管理 →", exact: true }).click();

  await page.locator('.inline-upload input[type="file"]').setInputFiles("samples/enterobacteria/App.jsx");
  await page.getByRole("button", { name: "上传新版", exact: true }).click();

  await expect(page.getByText("Cannot read properties of null")).toHaveCount(0);
  await expect(page.getByText("v000002", { exact: true })).toBeVisible();
  await expect(page.locator('.inline-upload input[type="file"]')).toHaveValue("");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "删除未发布版本" }).click({ timeout: 60_000 });
  await expect(page.getByText("v000002", { exact: true })).toHaveCount(0);
});

test("administrator can save teaching order and permanently delete an archived experiment", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("IntegrationTest-Password-2026");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByRole("link", { name: "▤ 实验管理", exact: true }).click();

  await page.getByRole("button", { name: "下移 教学顺序演示实验" }).click();
  await page.getByRole("button", { name: "保存教学顺序" }).click();
  await expect(page.getByRole("button", { name: "保存教学顺序" })).toBeDisabled();

  await page.getByRole("row").filter({ hasText: "教学顺序演示实验" }).getByRole("link", { name: "管理 →", exact: true }).click();
  await expect(page.locator(".generated-cover")).toBeVisible();
  await page.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByText("已归档", { exact: true })).toBeVisible();
  await page.getByLabel(/输入 Slug/).fill("teaching-order-demo");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "永久删除", exact: true }).click();
  await expect(page.getByRole("heading", { name: "实验管理" })).toBeVisible();
  await expect(page.getByText("教学顺序演示实验", { exact: true })).toHaveCount(0);
});
