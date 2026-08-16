import React, { useState, useMemo } from "react";

/* ==========================================================================
   肠道杆菌的分离培养与生化鉴定 · 决策型虚拟仿真实验
   面向临床医学本科生 · 医学微生物学
   所有实验结果均由下方知识库查表产生，不含随机生成内容。
   ========================================================================== */

/* ---------------------------- 1. 菌株知识库 ---------------------------- */

// m(生长, 菌落色, 大小, 质地, 乳糖判读, 黑心, 描述, 金属光泽)
const m = (grow, fill, size, tex, lac, black, desc, sheen = false) => ({
  grow, fill, size, tex, lac, black, desc, sheen,
});

const CLEAR = "#F0EADA"; // 无色/半透明菌落

const ORGS = {
  ecoli: {
    name: "大肠埃希菌", short: "E. coli", gram: "G⁻杆菌", genus: "埃希菌属",
    media: {
      mac: m("good", "#C4325A", "中等", "湿润", "分解", "无", "红色、不透明、边缘整齐"),
      ss: m("poor", "#CC8390", "细小", "湿润", "分解", "无", "大部分被抑制，少数微红色小菌落"),
      emb: m("good", "#2B2136", "中等", "湿润", "分解", "无", "紫黑色，有绿色金属光泽", true),
      blood: m("good", "#E4DCCD", "中等", "湿润", "不含乳糖", "无", "灰白色、湿润，部分菌株β溶血"),
      na: m("good", "#E2D8C2", "中等", "湿润", "不含乳糖", "无", "灰白色、光滑、湿润"),
      sda: m("poor", "#DFD5BE", "细小", "干燥", "不含乳糖", "无", "生长不良，散在细小菌落"),
    },
  },
  shigella_f: {
    name: "福氏志贺菌", short: "S. flexneri", gram: "G⁻杆菌", genus: "志贺菌属",
    media: {
      mac: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色、半透明、较小"),
      ss: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色半透明小菌落"),
      emb: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色、半透明"),
      blood: m("good", "#E4DCCD", "细小", "湿润", "不含乳糖", "无", "灰白色细小菌落，不溶血"),
      na: m("good", "#E2D8C2", "细小", "湿润", "不含乳糖", "无", "灰白细小菌落"),
      sda: m("poor", "#DFD5BE", "针尖状", "干燥", "不含乳糖", "无", "生长不良"),
    },
  },
  shigella_s: {
    name: "宋内志贺菌", short: "S. sonnei", gram: "G⁻杆菌", genus: "志贺菌属",
    media: {
      mac: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色、半透明，边缘不整（可见粗糙型）"),
      ss: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色半透明小菌落"),
      emb: m("good", CLEAR, "细小", "湿润", "不分解", "无", "无色、半透明"),
      blood: m("good", "#E4DCCD", "细小", "湿润", "不含乳糖", "无", "灰白色细小菌落"),
      na: m("good", "#E2D8C2", "细小", "湿润", "不含乳糖", "无", "灰白细小菌落"),
      sda: m("poor", "#DFD5BE", "针尖状", "干燥", "不含乳糖", "无", "生长不良"),
    },
  },
  typhi: {
    name: "伤寒沙门菌", short: "S. Typhi", gram: "G⁻杆菌", genus: "沙门菌属",
    media: {
      mac: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明、光滑湿润"),
      ss: m("good", CLEAR, "中等", "湿润", "不分解", "微", "无色菌落，中心可见极微小黑点"),
      emb: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明"),
      blood: m("good", "#E4DCCD", "中等", "湿润", "不含乳糖", "无", "灰白色、湿润，不溶血"),
      na: m("good", "#E2D8C2", "中等", "湿润", "不含乳糖", "无", "灰白色光滑菌落"),
      sda: m("poor", "#DFD5BE", "细小", "干燥", "不含乳糖", "无", "生长不良"),
    },
  },
  typhimurium: {
    name: "鼠伤寒沙门菌", short: "S. Typhimurium", gram: "G⁻杆菌", genus: "沙门菌属",
    media: {
      mac: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明"),
      ss: m("good", CLEAR, "中等", "湿润", "不分解", "有", "无色菌落，中心黑点明显"),
      emb: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明"),
      blood: m("good", "#E4DCCD", "中等", "湿润", "不含乳糖", "无", "灰白色、湿润"),
      na: m("good", "#E2D8C2", "中等", "湿润", "不含乳糖", "无", "灰白色光滑菌落"),
      sda: m("poor", "#DFD5BE", "细小", "干燥", "不含乳糖", "无", "生长不良"),
    },
  },
  klebsiella: {
    name: "肺炎克雷伯菌", short: "K. pneumoniae", gram: "G⁻粗短杆菌", genus: "克雷伯菌属",
    media: {
      mac: m("good", "#D4657F", "较大", "黏液状拉丝", "分解", "无", "红色、大而黏稠，接种环可拉出黏丝"),
      ss: m("poor", "#D08C99", "中等", "黏液状拉丝", "分解", "无", "微红色黏液型菌落"),
      emb: m("good", "#8F4A63", "较大", "黏液状拉丝", "分解", "无", "粉红色黏稠菌落，无金属光泽"),
      blood: m("good", "#E6DFD2", "较大", "黏液状拉丝", "不含乳糖", "无", "灰白色黏液型大菌落，不溶血"),
      na: m("good", "#E4DCC8", "较大", "黏液状拉丝", "不含乳糖", "无", "灰白黏液型菌落"),
      sda: m("poor", "#DFD5BE", "细小", "湿润", "不含乳糖", "无", "生长不良"),
    },
  },
  proteus: {
    name: "奇异变形杆菌", short: "P. mirabilis", gram: "G⁻多形性杆菌", genus: "变形杆菌属",
    media: {
      mac: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明（迁徙生长被胆盐抑制）"),
      ss: m("good", CLEAR, "中等", "湿润", "不分解", "有", "无色菌落，中心黑点明显"),
      emb: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、半透明"),
      blood: m("swarm", "#DED6C6", "—", "迁徙生长", "不含乳糖", "无", "呈同心圆波纹状迁徙生长，覆盖全板，无单个菌落"),
      na: m("swarm", "#DED6C6", "—", "迁徙生长", "不含乳糖", "无", "波纹状迁徙生长，无单个菌落"),
      sda: m("poor", "#DFD5BE", "细小", "干燥", "不含乳糖", "无", "生长不良"),
    },
  },
  pseudo: {
    name: "铜绿假单胞菌", short: "P. aeruginosa", gram: "G⁻细长杆菌", genus: "假单胞菌属（非肠杆菌科）",
    media: {
      mac: m("good", CLEAR, "中等", "湿润", "不分解", "无", "无色、扁平、边缘不整，可带金属光泽"),
      ss: m("poor", CLEAR, "细小", "湿润", "不分解", "无", "生长不良，无色小菌落"),
      emb: m("poor", CLEAR, "细小", "湿润", "不分解", "无", "生长不良，无色"),
      blood: m("good", "#7FA05A", "中等", "湿润", "不含乳糖", "无", "灰绿色菌落，周围培养基呈绿色，β溶血，有生姜气味"),
      na: m("good", "#8DAA63", "中等", "湿润", "不含乳糖", "无", "菌落及培养基呈黄绿色（绿脓素+荧光素）"),
      sda: m("good", "#8DAA63", "中等", "湿润", "不含乳糖", "无", "可生长并产生绿色素"),
    },
  },
  staph: {
    name: "金黄色葡萄球菌", short: "S. aureus", gram: "G⁺球菌（葡萄串状）", genus: "葡萄球菌属",
    media: {
      mac: m("none", CLEAR, "—", "—", "—", "无", "被胆盐抑制，不生长"),
      ss: m("none", CLEAR, "—", "—", "—", "无", "不生长"),
      emb: m("none", CLEAR, "—", "—", "—", "无", "被伊红美蓝抑制，不生长"),
      blood: m("good", "#D9AE3E", "中等", "湿润", "不含乳糖", "无", "金黄色、不透明，周围有透明β溶血环"),
      na: m("good", "#D9AE3E", "中等", "湿润", "不含乳糖", "无", "金黄色不透明菌落"),
      sda: m("good", "#D9AE3E", "细小", "湿润", "不含乳糖", "无", "可生长，金黄色"),
    },
  },
};

/* 生化反应真值矩阵 —— 唯一结果来源 */
const BIO = {
  ecoli:       { kia_slant:"A", kia_butt:"A", kia_gas:"+", kia_h2s:"-", indole:"+", mr:"+", vp:"-", citrate:"-", urease:"-", motility:"+", oxidase:"-", catalase:"+", lysine:"+", pda:"-", onpg:"+", glucose:"AG", lactose:"AG", sucrose:"A", mannitol:"AG" },
  shigella_f:  { kia_slant:"K", kia_butt:"A", kia_gas:"-", kia_h2s:"-", indole:"+", mr:"+", vp:"-", citrate:"-", urease:"-", motility:"-", oxidase:"-", catalase:"+", lysine:"-", pda:"-", onpg:"-", glucose:"A",  lactose:"-",  sucrose:"-", mannitol:"A" },
  shigella_s:  { kia_slant:"K", kia_butt:"A", kia_gas:"-", kia_h2s:"-", indole:"-", mr:"+", vp:"-", citrate:"-", urease:"-", motility:"-", oxidase:"-", catalase:"+", lysine:"-", pda:"-", onpg:"+", glucose:"A",  lactose:"-",  sucrose:"-", mannitol:"A" },
  typhi:       { kia_slant:"K", kia_butt:"A", kia_gas:"-", kia_h2s:"+", indole:"-", mr:"+", vp:"-", citrate:"-", urease:"-", motility:"+", oxidase:"-", catalase:"+", lysine:"+", pda:"-", onpg:"-", glucose:"A",  lactose:"-",  sucrose:"-", mannitol:"A" },
  typhimurium: { kia_slant:"K", kia_butt:"A", kia_gas:"+", kia_h2s:"+++", indole:"-", mr:"+", vp:"-", citrate:"+", urease:"-", motility:"+", oxidase:"-", catalase:"+", lysine:"+", pda:"-", onpg:"-", glucose:"AG", lactose:"-", sucrose:"-", mannitol:"AG" },
  klebsiella:  { kia_slant:"A", kia_butt:"A", kia_gas:"+", kia_h2s:"-", indole:"-", mr:"-", vp:"+", citrate:"+", urease:"+", motility:"-", oxidase:"-", catalase:"+", lysine:"+", pda:"-", onpg:"+", glucose:"AG", lactose:"AG", sucrose:"AG", mannitol:"AG" },
  proteus:     { kia_slant:"K", kia_butt:"A", kia_gas:"+", kia_h2s:"+++", indole:"-", mr:"+", vp:"-", citrate:"+", urease:"+++", motility:"+", oxidase:"-", catalase:"+", lysine:"-", pda:"+", onpg:"-", glucose:"AG", lactose:"-", sucrose:"A", mannitol:"-" },
  pseudo:      { kia_slant:"K", kia_butt:"K", kia_gas:"-", kia_h2s:"-", indole:"-", mr:"-", vp:"-", citrate:"+", urease:"-", motility:"+", oxidase:"+", catalase:"+", lysine:"-", pda:"-", onpg:"-", glucose:"-", lactose:"-", sucrose:"-", mannitol:"-" },
  staph:       { kia_slant:"A", kia_butt:"A", kia_gas:"-", kia_h2s:"-", indole:"-", mr:"+", vp:"+", citrate:"-", urease:"+", motility:"-", oxidase:"-", catalase:"+", lysine:"-", pda:"-", onpg:"+", glucose:"A", lactose:"A", sucrose:"A", mannitol:"A" },
};

/* ---------------------------- 2. 判读项定义 ---------------------------- */

const READOUTS = {
  kia_slant: { label: "KIA 斜面", ph: { A: "斜面呈黄色", K: "斜面呈红色" }, cn: { A: "产酸——分解乳糖/蔗糖", K: "产碱——不分解乳糖/蔗糖" } },
  kia_butt:  { label: "KIA 底层", ph: { A: "底层呈黄色", K: "底层呈红色或不变色" }, cn: { A: "分解葡萄糖产酸", K: "不分解葡萄糖" } },
  kia_gas:   { label: "KIA 产气", ph: { "+": "琼脂中有气泡、断裂或被顶起", "-": "琼脂柱完整，无气泡" }, cn: { "+": "产气 (+)", "-": "不产气 (−)" } },
  kia_h2s:   { label: "硫化氢 H₂S", ph: { "+++": "底层大片黑色沉淀", "+": "穿刺线周围少量黑点", "-": "培养基不变黑" }, cn: { "+++": "强阳性 (+++)", "+": "弱阳性 (+)", "-": "阴性 (−)" } },
  indole:    { label: "靛基质（吲哚）", ph: { "+": "加试剂后液面出现玫瑰红色环", "-": "液面不显红色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  mr:        { label: "甲基红 MR", ph: { "+": "加甲基红后呈鲜红色", "-": "呈橘黄色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  vp:        { label: "V-P 试验", ph: { "+": "加试剂后呈红色", "-": "不变色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  citrate:   { label: "枸橼酸盐利用", ph: { "+": "斜面见菌苔生长，培养基由绿变深蓝", "-": "无菌苔，培养基仍为绿色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  urease:    { label: "尿素酶", ph: { "+++": "2 小时内全管变为红色", "+": "培养 24 小时后部分变红", "-": "保持橘黄色" }, cn: { "+++": "迅速强阳性 (+++)", "+": "弱阳性 (+)", "-": "阴性 (−)" } },
  motility:  { label: "半固体动力", ph: { "+": "穿刺线周围云雾状扩散混浊", "-": "仅沿穿刺线生长，周围澄清" }, cn: { "+": "有动力 (+)", "-": "无动力 (−)" } },
  oxidase:   { label: "氧化酶", ph: { "+": "滤纸上 10 秒内出现紫红色", "-": "滤纸不变色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  catalase:  { label: "触酶", ph: { "+": "滴加 H₂O₂ 后大量气泡", "-": "无气泡" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  lysine:    { label: "赖氨酸脱羧酶", ph: { "+": "管内呈紫色", "-": "管内呈黄色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  pda:       { label: "苯丙氨酸脱氨酶", ph: { "+": "加 FeCl₃ 后斜面呈绿色", "-": "不变色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  onpg:      { label: "ONPG", ph: { "+": "液体呈黄色", "-": "液体无色" }, cn: { "+": "阳性 (+)", "-": "阴性 (−)" } },
  glucose:   { label: "葡萄糖发酵", ph: { AG: "培养基变黄，小倒管内有气泡", A: "培养基变黄，无气泡", "-": "培养基不变色" }, cn: { AG: "产酸产气 (⊕)", A: "产酸不产气 (+)", "-": "不发酵 (−)" } },
  lactose:   { label: "乳糖发酵", ph: { AG: "培养基变黄，小倒管内有气泡", A: "培养基变黄，无气泡", "-": "培养基不变色" }, cn: { AG: "产酸产气 (⊕)", A: "产酸不产气 (+)", "-": "不发酵 (−)" } },
  sucrose:   { label: "蔗糖发酵", ph: { AG: "培养基变黄，小倒管内有气泡", A: "培养基变黄，无气泡", "-": "培养基不变色" }, cn: { AG: "产酸产气 (⊕)", A: "产酸不产气 (+)", "-": "不发酵 (−)" } },
  mannitol:  { label: "甘露醇发酵", ph: { AG: "培养基变黄，小倒管内有气泡", A: "培养基变黄，无气泡", "-": "培养基不变色" }, cn: { AG: "产酸产气 (⊕)", A: "产酸不产气 (+)", "-": "不发酵 (−)" } },
};

const TESTS = {
  kia:      { name: "克氏双糖铁琼脂 KIA", cost: 6, hours: 20, ro: ["kia_slant", "kia_butt", "kia_gas", "kia_h2s"], tech: "kia", tip: "同时观察乳糖/葡萄糖分解、产气与 H₂S" },
  miu:      { name: "动力-吲哚-尿素 MIU", cost: 6, hours: 20, ro: ["motility", "indole", "urease"], tech: "stab", tip: "一管三用，需垂直穿刺接种" },
  indole:   { name: "靛基质（吲哚）试验", cost: 3, hours: 20, ro: ["indole"] },
  mr:       { name: "甲基红 MR 试验", cost: 3, hours: 20, ro: ["mr"] },
  vp:       { name: "V-P 试验", cost: 3, hours: 20, ro: ["vp"] },
  citrate:  { name: "枸橼酸盐利用试验", cost: 3, hours: 24, ro: ["citrate"] },
  urease:   { name: "尿素酶试验", cost: 3, hours: 20, ro: ["urease"] },
  motility: { name: "半固体动力试验", cost: 3, hours: 20, ro: ["motility"], tech: "stab" },
  oxidase:  { name: "氧化酶试验", cost: 2, hours: 0, ro: ["oxidase"], tip: "1 分钟内出结果，用于肠杆菌科初筛" },
  catalase: { name: "触酶试验", cost: 2, hours: 0, ro: ["catalase"] },
  lysine:   { name: "赖氨酸脱羧酶试验", cost: 4, hours: 20, ro: ["lysine"] },
  pda:      { name: "苯丙氨酸脱氨酶试验", cost: 3, hours: 20, ro: ["pda"] },
  onpg:     { name: "ONPG 试验", cost: 4, hours: 6, ro: ["onpg"] },
  glucose:  { name: "葡萄糖发酵管", cost: 2, hours: 20, ro: ["glucose"] },
  lactose:  { name: "乳糖发酵管", cost: 2, hours: 20, ro: ["lactose"] },
  sucrose:  { name: "蔗糖发酵管", cost: 2, hours: 20, ro: ["sucrose"] },
  mannitol: { name: "甘露醇发酵管", cost: 2, hours: 20, ro: ["mannitol"] },
};

/* ---------------------------- 3. 培养基与操作 ---------------------------- */

const MEDIA = {
  mac: { name: "麦康凯琼脂", abbr: "MAC", agar: "#C79FAC", kind: "弱选择鉴别", note: "含胆盐与乳糖，中性红指示剂", good: true },
  ss:  { name: "SS 琼脂", abbr: "SS", agar: "#D6A76A", kind: "强选择鉴别", note: "强选择性，抑制大肠埃希菌，含硫代硫酸钠+枸橼酸铁", good: true },
  emb: { name: "伊红美蓝琼脂", abbr: "EMB", agar: "#7E3B52", kind: "弱选择鉴别", note: "伊红-美蓝抑制 G⁺菌，强发酵乳糖菌呈金属光泽", good: true },
  blood: { name: "血琼脂平板", abbr: "BAP", agar: "#8E2B2B", kind: "营养非选择", note: "观察溶血与色素，但不能抑制杂菌", good: false },
  na:  { name: "普通营养琼脂", abbr: "NA", agar: "#D3C9A4", kind: "营养非选择", note: "无鉴别能力", good: false },
  sda: { name: "沙保弱葡萄糖琼脂", abbr: "SDA", agar: "#D8CBA0", kind: "真菌培养基", note: "用于真菌分离，非细菌用", good: false },
};

const ANTISERA = [
  { id: "shig_poly", name: "志贺菌属多价诊断血清", hits: ["shigella_f", "shigella_s"] },
  { id: "shig_b", name: "福氏志贺菌 B 群血清", hits: ["shigella_f"] },
  { id: "shig_d", name: "宋内志贺菌 D 群血清", hits: ["shigella_s"] },
  { id: "sal_poly", name: "沙门菌 O 多价血清（A–F 群）", hits: ["typhi", "typhimurium"] },
  { id: "sal_vi", name: "沙门菌 Vi 血清", hits: ["typhi"] },
  { id: "sal_o9", name: "沙门菌 O9（D 群）血清", hits: ["typhi"] },
  { id: "sal_o4", name: "沙门菌 O4（B 群）血清", hits: ["typhimurium"] },
  { id: "ecoli_poly", name: "致病性大肠埃希菌多价 O 血清", hits: ["ecoli"] },
  { id: "none", name: "不做血清学凝集", hits: [] },
];

/* ---------------------------- 4. 病例库 ---------------------------- */

const CASES = {
  A: {
    id: "A", title: "幼儿园群体腹泻",
    history:
      "患儿，女，4 岁。发热 1 天，腹痛、腹泻 8 次/日，为黏液脓血便，伴明显里急后重。查体：体温 38.9℃，左下腹压痛。血常规：WBC 13.6×10⁹/L，中性粒细胞 82%。粪便常规：白细胞满视野，可见吞噬细胞，红细胞 10–15/HP。同班另有 3 名儿童出现类似症状。",
    targets: ["shigella_f", "shigella_s"],
    flora: [{ id: "ecoli", w: 25 }, { id: "proteus", w: 2 }],
    specimens: [
      { id: "stool_mp", name: "粪便（挑取黏液脓血部分）", best: true },
      { id: "stool_n", name: "粪便（成形部分）" },
      { id: "swab", name: "肛拭子" },
      { id: "blood", name: "静脉血" },
    ],
    timings: [
      { id: "t_early", name: "使用抗生素前、发病急性期立即采集", best: true },
      { id: "t_ab", name: "已用抗生素 2 天后采集" },
      { id: "t_late", name: "症状缓解后 5 天采集" },
    ],
    yield: (sp, t) => {
      const base = { stool_mp: 8, stool_n: 3, swab: 4, blood: 0 }[sp] || 0;
      const f = { t_early: 1, t_ab: 0.3, t_late: 0.2 }[t] || 1;
      return Math.round(base * f);
    },
    enrichBest: "gn",
    key: "志贺菌属无动力、不发酵乳糖、不产气、不产 H₂S，是与沙门菌鉴别的关键。",
  },
  B: {
    id: "B", title: "持续高热两周",
    history:
      "男，23 岁，学生。持续发热 12 天，体温呈阶梯上升后稽留于 39.5℃ 左右，伴表情淡漠、食欲减退、腹胀。查体：相对缓脉（脉搏 88 次/分），胸腹壁散在淡红色斑丘疹，肝脾轻度肿大。血常规：WBC 3.2×10⁹/L，嗜酸性粒细胞消失。",
    targets: ["typhi"],
    flora: [{ id: "ecoli", w: 25 }],
    specimens: [
      { id: "blood", name: "静脉血（血培养）", best: true },
      { id: "marrow", name: "骨髓液", best: true },
      { id: "stool_n", name: "粪便" },
      { id: "urine", name: "清洁中段尿" },
    ],
    timings: [
      { id: "w1", name: "病程第 1 周" },
      { id: "w23", name: "病程第 2–3 周", best: true },
      { id: "conv", name: "恢复期（第 4 周后）" },
    ],
    yield: (sp, t) => {
      if (sp === "blood") return { w1: 8, w23: 2, conv: 0 }[t] || 0;
      if (sp === "marrow") return 9;
      if (sp === "stool_n") return { w1: 0, w23: 5, conv: 2 }[t] || 0;
      if (sp === "urine") return { w1: 0, w23: 3, conv: 1 }[t] || 0;
      return 0;
    },
    floraBySpecimen: { blood: [], marrow: [] },
    enrichBest: "sf",
    bloodNeedsBroth: true,
    key: "标本采集时机决定检出率：第 1 周血培养阳性率最高，第 2–3 周粪便、尿培养阳性率上升；骨髓培养全程阳性率最高。",
  },
  C: {
    id: "C", title: "婚宴后集体食物中毒",
    history:
      "参加同一婚宴的 26 人中 11 人于餐后 10–18 小时出现恶心、呕吐、腹痛、水样便，部分带少量黏液，体温 38.2–39.0℃。可疑食物为凉拌卤味与蛋制品。患者症状多在 2–4 天内自限。",
    targets: ["typhimurium"],
    flora: [{ id: "ecoli", w: 22 }, { id: "proteus", w: 3 }],
    specimens: [
      { id: "stool_n", name: "患者粪便", best: true },
      { id: "vomit", name: "呕吐物" },
      { id: "food", name: "可疑剩余食物", best: true },
      { id: "blood", name: "静脉血" },
    ],
    timings: [
      { id: "t_early", name: "发病 24 小时内、用药前采集", best: true },
      { id: "t_ab", name: "已用抗生素后采集" },
      { id: "t_late", name: "症状消失后采集" },
    ],
    yield: (sp, t) => {
      const base = { stool_n: 8, vomit: 4, food: 7, blood: 1 }[sp] || 0;
      const f = { t_early: 1, t_ab: 0.3, t_late: 0.25 }[t] || 1;
      return Math.round(base * f);
    },
    enrichBest: "sf",
    key: "胃肠炎型沙门菌 H₂S 强阳性、有动力、枸橼酸盐阳性，可与志贺菌及伤寒沙门菌区分。",
  },
  D: {
    id: "D", title: "留置导尿后尿路感染",
    history:
      "女，71 岁，脑梗死后长期卧床，留置导尿 9 天。近 2 天发热 38.4℃，尿液浑浊，有明显氨臭味。尿常规：WBC 满视野，亚硝酸盐阳性，pH 8.2，可见磷酸铵镁结晶。",
    targets: ["proteus", "klebsiella"],
    flora: [{ id: "ecoli", w: 12 }],
    specimens: [
      { id: "urine", name: "清洁中段尿（无菌留取）", best: true },
      { id: "cath", name: "导尿管尖端" },
      { id: "meatus", name: "尿道口拭子" },
      { id: "blood", name: "静脉血" },
    ],
    timings: [
      { id: "t_early", name: "抗生素使用前、晨起首次尿，1 小时内送检", best: true },
      { id: "t_room", name: "室温放置 6 小时后送检" },
      { id: "t_ab", name: "已用抗生素 3 天后采集" },
    ],
    yield: (sp, t) => {
      const base = { urine: 8, cath: 6, meatus: 3, blood: 1 }[sp] || 0;
      const f = { t_early: 1, t_room: 0.7, t_ab: 0.3 }[t] || 1;
      return Math.round(base * f);
    },
    enrichBest: "none",
    key: "尿液碱化、氨臭味、磷酸铵镁结晶提示产尿素酶菌；变形杆菌尿素酶迅速强阳性并在血平板迁徙生长。",
  },
  E: {
    id: "E", title: "烧伤创面绿色脓液",
    history:
      "男，34 岁，火焰烧伤后第 8 天。背部创面敷料被染成蓝绿色，可闻及特殊生姜样气味，创缘红肿，坏死组织与绿色脓性分泌物并存。体温 38.7℃。",
    targets: ["pseudo"],
    flora: [{ id: "staph", w: 8 }, { id: "ecoli", w: 4 }],
    specimens: [
      { id: "deep", name: "清创后创面深部分泌物", best: true },
      { id: "surface", name: "创面表面拭子" },
      { id: "blood", name: "静脉血" },
      { id: "stool_n", name: "粪便" },
    ],
    timings: [
      { id: "t_early", name: "换药前、局部消毒后采集深部标本", best: true },
      { id: "t_after", name: "已外用抗菌敷料后采集" },
      { id: "t_late", name: "创面愈合期采集" },
    ],
    yield: (sp, t) => {
      const base = { deep: 8, surface: 6, blood: 1, stool_n: 0 }[sp] || 0;
      const f = { t_early: 1, t_after: 0.5, t_late: 0.3 }[t] || 1;
      return Math.round(base * f);
    },
    enrichBest: "none",
    key: "氧化酶阳性即应立即排除肠杆菌科——这是整个鉴定路径的第一个分叉点。",
  },
};

const ENRICH = [
  { id: "none", name: "不增菌，直接接种平板", hours: 0, cost: 0 },
  { id: "sf", name: "亚硒酸盐（SF）增菌液", hours: 18, cost: 5, favors: ["typhi", "typhimurium"] },
  { id: "gn", name: "GN 增菌液", hours: 8, cost: 5, favors: ["shigella_f", "shigella_s"] },
  { id: "broth", name: "胆汁肉汤 / 血培养瓶增菌", hours: 24, cost: 12, favors: ["typhi"] },
  { id: "app", name: "碱性蛋白胨水", hours: 8, cost: 4, favors: [] },
];

const STREAKS = [
  { id: "quadrant", name: "分区划线法（四区）", ok: 2, desc: "接种环每区间灼烧，逐区稀释" },
  { id: "continuous", name: "连续划线法", ok: 2, desc: "不灼烧连续划满全板" },
  { id: "spread", name: "密集涂布", ok: 0, desc: "用棉签将标本均匀涂满平板" },
];

const TEMPS = [
  { id: 35, name: "35 ℃" }, { id: 22, name: "室温 22 ℃" },
  { id: 42, name: "42 ℃" }, { id: 4, name: "4 ℃ 冰箱" },
];
const HOURS = [
  { id: 6, name: "6 小时" }, { id: 20, name: "18–24 小时" }, { id: 48, name: "48 小时" },
];

/* ---------------------------- 5. 引擎 ---------------------------- */

const ALL_ORGS = Object.keys(ORGS);

function truth(orgId, ro) { return BIO[orgId] ? BIO[orgId][ro] : undefined; }

/** 依据已观察到的判读结果筛选候选菌 */
function candidates(obs, pool = ALL_ORGS) {
  return pool.filter((o) => Object.keys(obs).every((ro) => obs[ro] == null || truth(o, ro) === obs[ro]));
}

/** 贪心求最少充分试验组合（判读项级别） */
function minimalPath(targetId, pool = ALL_ORGS) {
  let remain = pool.slice();
  const path = [];
  const allRo = Object.keys(READOUTS);
  let guard = 0;
  while (remain.length > 1 && guard++ < 12) {
    let best = null, bestSize = remain.length;
    for (const ro of allRo) {
      if (path.includes(ro)) continue;
      const v = truth(targetId, ro);
      if (v === undefined) continue;
      const size = remain.filter((o) => truth(o, ro) === v).length;
      if (size < bestSize) { bestSize = size; best = ro; }
    }
    if (!best) break;
    path.push(best);
    remain = remain.filter((o) => truth(o, best) === truth(targetId, best));
  }
  return path;
}

/** 伪随机数（固定种子，保证同一局结果稳定） */
function rng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];

/** 生成一块平板的菌落分布 —— 结果完全由知识库+参数决定 */
function makePlate(mediumId, orgWeights, streakId, temp, hours, seed) {
  const streak = STREAKS.find((s) => s.id === streakId);
  const growers = [];
  for (const ow of orgWeights) {
    const info = ORGS[ow.id].media[mediumId];
    if (!info || info.grow === "none") continue;
    if (temp === 4) continue;
    if (temp === 42 && (ow.id === "shigella_f" || ow.id === "shigella_s")) continue;
    let scale = 1;
    if (info.grow === "poor") scale *= 0.35;
    if (temp === 22) scale *= 0.45;
    if (temp === 42) scale *= 0.6;
    if (hours === 6) scale *= 0.3;
    if (hours === 48) scale *= 1.35;
    growers.push({ ...ow, info, scale });
  }
  if (!growers.length) {
    return { mediumId, colonies: [], swarm: false, empty: true, note: temp === 4 ? "4 ℃ 不适宜细菌生长，平板未见任何菌落。" : "平板经培养后未见细菌生长。" };
  }
  const swarmer = growers.find((g) => g.info.grow === "swarm");
  if (swarmer) {
    return { mediumId, colonies: [], swarm: true, swarmOrg: swarmer.id, empty: false, note: `平板表面被${ORGS[swarmer.id].name}的同心圆状迁徙生长覆盖，其余菌落被淹没，无法挑取单个菌落。` };
  }

  const rnd = rng(seed);
  const total = growers.reduce((a, b) => a + b.w, 0);
  const sectors = [
    { a0: 100, a1: 190, r0: 62, r1: 122, n: 40, pick: false },
    { a0: 188, a1: 258, r0: 55, r1: 120, n: 24, pick: true },
    { a0: 256, a1: 332, r0: 48, r1: 114, n: 12, pick: true },
    { a0: 330, a1: 458, r0: 22, r1: 96, n: 6, pick: true },
  ];
  const discreteFrom = streak.ok === 0 ? 99 : streak.id === "continuous" ? 2 : 1;
  const colonies = [];
  let idx = 0;
  sectors.forEach((sec, si) => {
    const n = si === 0 ? sec.n : Math.max(3, Math.round(sec.n * (hours === 6 ? 0.7 : 1)));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const ang = sec.a0 + (sec.a1 - sec.a0) * t + (rnd() - 0.5) * 6;
      const rr = sec.r0 + (sec.r1 - sec.r0) * (((i % 5) / 4) * 0.9 + rnd() * 0.12);
      // 按权重抽取菌种（确定性伪随机）
      let acc = rnd() * total, chosen = growers[0];
      for (const g of growers) { acc -= g.w; if (acc <= 0) { chosen = g; break; } }
      const sizeMap = { 针尖状: 1.8, 细小: 3.0, 中等: 4.4, 较大: 6.2, "—": 4 };
      const baseR = (sizeMap[chosen.info.size] || 4) * chosen.scale;
      const [x, y] = polar(150, 150, rr, ang);
      colonies.push({
        id: `c${idx++}`, orgId: chosen.id, x, y,
        r: Math.max(1.2, baseR * (0.85 + rnd() * 0.3)),
        fill: chosen.info.fill, sheen: chosen.info.sheen,
        black: chosen.info.black, sector: si,
        pickable: si >= discreteFrom && hours !== 6,
      });
    }
  });
  let note = "";
  if (streak.ok === 0) note = "菌落密集融合成片，全板无单个菌落，无法挑取纯培养物。";
  else if (hours === 6) note = "培养时间过短，菌落过于细小，形态特征难以判读，也不宜挑取。";
  else if (hours === 48) note = "培养 48 小时，菌落偏大，部分区域已相互融合。";
  else if (temp === 22) note = "室温培养，各菌落均较预期细小，生长不良。";
  else if (temp === 42) note = "42 ℃ 培养，部分菌种生长受抑制。";
  return { mediumId, colonies, swarm: false, empty: false, note };
}

/* ---------------------------- 6. 通用 UI ---------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');
.vm-root{--bench:#D7DFDB;--porc:#F7F9F8;--ink:#17211E;--mut:#5E6E69;--rule:#B7C3BE;--phenol:#B3204A;--bromo:#1D5B85;--amber:#B0762A;--ok:#2E7D57;
  background:var(--bench);color:var(--ink);min-height:100vh;font-family:'Noto Sans SC','IBM Plex Sans',system-ui,sans-serif;font-size:15px;line-height:1.7;}
.vm-root *{box-sizing:border-box;}
.vm-mono{font-family:'IBM Plex Mono',ui-monospace,monospace;}
.vm-cond{font-family:'IBM Plex Sans Condensed','Noto Sans SC',sans-serif;letter-spacing:.06em;}
.vm-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--mut);}
.vm-wrap{max-width:1180px;margin:0 auto;padding:0 20px 80px;}
.vm-head{position:sticky;top:0;z-index:30;background:#17211E;color:#E7EDEA;border-bottom:3px solid var(--phenol);}
.vm-headin{max-width:1180px;margin:0 auto;padding:10px 20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;}
.vm-title{font-family:'IBM Plex Sans Condensed',sans-serif;font-weight:700;font-size:16px;letter-spacing:.04em;}
.vm-meta{display:flex;gap:16px;margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#9FB3AC;flex-wrap:wrap;}
.vm-meta b{color:#F2F6F4;font-weight:500;}
.vm-steps{display:flex;gap:0;overflow-x:auto;background:#0F1815;}
.vm-stepsin{max-width:1180px;margin:0 auto;display:flex;padding:0 20px;}
.vm-step{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;padding:7px 11px;color:#657873;white-space:nowrap;border-bottom:2px solid transparent;}
.vm-step.on{color:#fff;border-bottom-color:var(--phenol);}
.vm-step.done{color:#4E9E7B;}
.vm-card{background:var(--porc);border:1px solid var(--rule);border-radius:2px;padding:22px;margin:18px 0;}
.vm-h2{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:24px;font-weight:700;margin:0 0 4px;letter-spacing:.01em;}
.vm-h3{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:16px;font-weight:700;margin:22px 0 8px;letter-spacing:.02em;}
.vm-sub{color:var(--mut);font-size:13.5px;margin:0 0 16px;}
.vm-grid{display:grid;gap:10px;}
.vm-g2{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));}
.vm-g3{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));}
.vm-opt{text-align:left;background:#fff;border:1px solid var(--rule);border-radius:2px;padding:11px 13px;cursor:pointer;font:inherit;color:inherit;transition:border-color .12s,background .12s;display:block;width:100%;}
.vm-opt:hover{border-color:var(--ink);}
.vm-opt.sel{border-color:var(--phenol);border-left-width:4px;background:#FDF4F6;padding-left:10px;}
.vm-opt:focus-visible{outline:2px solid var(--bromo);outline-offset:2px;}
.vm-opt small{display:block;color:var(--mut);font-size:12px;line-height:1.5;margin-top:2px;}
.vm-btn{font-family:'IBM Plex Sans Condensed',sans-serif;font-weight:700;letter-spacing:.06em;background:var(--ink);color:#fff;border:none;border-radius:2px;padding:11px 22px;cursor:pointer;font-size:14px;}
.vm-btn:disabled{background:#A7B3AE;cursor:not-allowed;}
.vm-btn.alt{background:transparent;color:var(--ink);border:1px solid var(--ink);}
.vm-btn:focus-visible{outline:2px solid var(--phenol);outline-offset:2px;}
.vm-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:20px;}
.vm-tag{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;border:1px solid var(--rule);padding:2px 7px;border-radius:2px;color:var(--mut);}
.vm-note{border-left:3px solid var(--amber);background:#FBF6EC;padding:10px 14px;font-size:13.5px;margin:12px 0;}
.vm-tbl{width:100%;border-collapse:collapse;font-size:13px;}
.vm-tbl th,.vm-tbl td{border:1px solid var(--rule);padding:6px 9px;text-align:left;vertical-align:top;}
.vm-tbl th{background:#E9EEEC;font-weight:600;font-family:'IBM Plex Sans Condensed',sans-serif;}
.vm-tbl td.m{font-family:'IBM Plex Mono',monospace;}
.vm-sel{font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--rule);background:#fff;border-radius:2px;width:100%;}
.vm-nb{position:fixed;right:0;top:0;height:100%;width:min(420px,92vw);background:var(--porc);border-left:1px solid var(--rule);z-index:50;overflow:auto;padding:20px;box-shadow:-8px 0 30px rgba(0,0,0,.14);}
.vm-nbtoggle{position:fixed;right:18px;bottom:18px;z-index:40;background:var(--phenol);color:#fff;border:none;border-radius:2px;padding:12px 18px;font-family:'IBM Plex Sans Condensed',sans-serif;font-weight:700;letter-spacing:.06em;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.22);}
.vm-plates{display:flex;gap:16px;flex-wrap:wrap;}
.vm-plate{background:#fff;border:1px solid var(--rule);padding:10px;border-radius:2px;}
.vm-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;background:var(--ink);color:#fff;padding:11px 18px;border-radius:2px;z-index:60;font-size:13.5px;max-width:min(560px,92vw);}
.vm-score{display:flex;align-items:baseline;gap:8px;font-family:'IBM Plex Mono',monospace;}
.vm-meter{height:8px;background:#E1E7E4;border:1px solid var(--rule);position:relative;}
.vm-meter i{position:absolute;left:0;top:0;bottom:0;background:var(--phenol);display:block;}
.vm-tree{border-left:2px solid var(--rule);padding-left:16px;margin-left:6px;}
.vm-treeitem{position:relative;padding:8px 0;}
.vm-treeitem::before{content:'';position:absolute;left:-21px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--phenol);border:2px solid var(--porc);}
.vm-chip{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:11px;border:1px solid var(--rule);padding:1px 6px;margin:2px 4px 2px 0;border-radius:2px;background:#fff;}
.vm-chip.out{text-decoration:line-through;color:#9AA8A3;background:#EDF1EF;}
.vm-chip.in{border-color:var(--ok);color:var(--ok);}
@media (max-width:640px){.vm-card{padding:15px;}.vm-h2{font-size:20px;}}
@media (prefers-reduced-motion:reduce){.vm-root *{transition:none!important;animation:none!important;}}
`;

function Opt({ sel, onClick, title, sub, disabled }) {
  return (
    <button className={"vm-opt" + (sel ? " sel" : "")} onClick={onClick} disabled={disabled} type="button">
      <span style={{ fontWeight: 500 }}>{title}</span>
      {sub ? <small>{sub}</small> : null}
    </button>
  );
}

/* 培养皿 SVG —— 本实验的标志性元素 */
function Petri({ plate, onPick, picked, showLabels = true }) {
  const med = MEDIA[plate.mediumId];
  return (
    <div className="vm-plate">
      <div className="vm-eyebrow" style={{ marginBottom: 6 }}>{med.abbr} · {med.name}</div>
      <svg viewBox="0 0 300 300" width="252" height="252" role="img" aria-label={`${med.name}平板`}>
        <defs>
          <radialGradient id={`lid-${plate.mediumId}`} cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="150" r="142" fill="#E6EAE8" stroke="#AEBAB5" strokeWidth="2" />
        <circle cx="150" cy="150" r="132" fill={med.agar} />
        {plate.swarm && (
          <g opacity="0.75">
            {[38, 58, 78, 98, 118].map((r) => (
              <circle key={r} cx="150" cy="150" r={r} fill="none" stroke="#F0EADA" strokeWidth="7" opacity="0.55" />
            ))}
            <circle cx="150" cy="150" r="22" fill="#EFE9D9" opacity="0.9" />
          </g>
        )}
        {plate.colonies.map((c) => {
          const isPick = picked && picked.plateId === plate.mediumId && picked.colonyId === c.id;
          return (
            <g key={c.id}>
              <circle
                cx={c.x} cy={c.y} r={c.r}
                fill={c.fill}
                fillOpacity={c.fill === CLEAR ? 0.8 : 1}
                stroke={c.fill === CLEAR ? "#B9AE8E" : "none"}
                strokeWidth={c.fill === CLEAR ? 0.6 : 0}
                style={{ cursor: c.pickable && onPick ? "pointer" : "default" }}
                onClick={() => onPick && onPick(c)}
              />
              {c.sheen && <circle cx={c.x - c.r * 0.3} cy={c.y - c.r * 0.3} r={c.r * 0.45} fill="#4E8C5A" opacity="0.85" />}
              {c.black === "有" && <circle cx={c.x} cy={c.y} r={c.r * 0.42} fill="#1A1A1A" />}
              {c.black === "微" && <circle cx={c.x} cy={c.y} r={c.r * 0.18} fill="#2A2A2A" opacity="0.8" />}
              {isPick && <circle cx={c.x} cy={c.y} r={c.r + 6} fill="none" stroke="#B3204A" strokeWidth="2.5" />}
            </g>
          );
        })}
        <circle cx="150" cy="150" r="142" fill={`url(#lid-${plate.mediumId})`} pointerEvents="none" />
      </svg>
      {showLabels && plate.note ? <div style={{ fontSize: 12, color: "#5E6E69", maxWidth: 252, marginTop: 6 }}>{plate.note}</div> : null}
    </div>
  );
}

/* 试管 SVG */
function Tube({ testId, orgId, blocked }) {
  const t = TESTS[testId];
  const colorOf = () => {
    if (blocked) return ["#CFCFC4", "#CFCFC4"];
    if (testId === "kia") {
      const s = truth(orgId, "kia_slant") === "A" ? "#E3C93C" : "#C4344F";
      const b = truth(orgId, "kia_butt") === "A" ? "#E3C93C" : "#C4344F";
      return [s, b];
    }
    if (testId === "urease") {
      const v = truth(orgId, "urease");
      return v === "+++" ? ["#C63B6C", "#C63B6C"] : v === "+" ? ["#D9749A", "#E0A24C"] : ["#E0A24C", "#E0A24C"];
    }
    if (testId === "citrate") return truth(orgId, "citrate") === "+" ? ["#2857A0", "#2857A0"] : ["#4E9E7B", "#4E9E7B"];
    if (testId === "lysine") return truth(orgId, "lysine") === "+" ? ["#7B4EA0", "#7B4EA0"] : ["#E3C93C", "#E3C93C"];
    if (testId === "indole") return truth(orgId, "indole") === "+" ? ["#C63B4E", "#D9CBA8"] : ["#D9C48C", "#D9CBA8"];
    if (testId === "mr") return truth(orgId, "mr") === "+" ? ["#C0203C", "#C0203C"] : ["#E0A24C", "#E0A24C"];
    if (testId === "vp") return truth(orgId, "vp") === "+" ? ["#C94A5E", "#C94A5E"] : ["#E2DCC0", "#E2DCC0"];
    if (testId === "pda") return truth(orgId, "pda") === "+" ? ["#3F8A4E", "#D9CBA8"] : ["#D9CBA8", "#D9CBA8"];
    if (testId === "onpg") return truth(orgId, "onpg") === "+" ? ["#E3C93C", "#E3C93C"] : ["#EFEFE4", "#EFEFE4"];
    if (["glucose", "lactose", "sucrose", "mannitol"].includes(testId)) {
      const v = truth(orgId, testId);
      return v === "-" ? ["#C4344F", "#C4344F"] : ["#E3C93C", "#E3C93C"];
    }
    if (testId === "miu" || testId === "motility") return ["#E8E2CC", "#E8E2CC"];
    return ["#DED8C2", "#DED8C2"];
  };
  const [top, bot] = colorOf();
  const gas = testId === "kia" && truth(orgId, "kia_gas") === "+" && !blocked;
  const h2s = testId === "kia" ? truth(orgId, "kia_h2s") : null;
  const motile = (testId === "miu" || testId === "motility") && truth(orgId, "motility") === "+" && !blocked;
  const bubbles = ["glucose", "lactose", "sucrose", "mannitol"].includes(testId) && (truth(orgId, testId) || "").includes("G");
  return (
    <div style={{ textAlign: "center", width: 96 }}>
      <svg viewBox="0 0 60 190" width="60" height="190" role="img" aria-label={t.name}>
        <rect x="16" y="6" width="28" height="10" fill="#B7C3BE" />
        <path d="M16 12 L16 168 Q16 184 30 184 Q44 184 44 168 L44 12 Z" fill="#F2F5F4" stroke="#9FADA8" strokeWidth="1.4" />
        {testId === "kia" ? (
          <>
            <path d="M18 40 L42 24 L42 96 L18 96 Z" fill={top} />
            <path d="M18 96 L42 96 L42 166 Q42 181 30 181 Q18 181 18 166 Z" fill={bot} />
            {h2s === "+++" && <path d="M18 112 L42 112 L42 166 Q42 181 30 181 Q18 181 18 166 Z" fill="#1B1B1B" opacity="0.92" />}
            {h2s === "+" && <ellipse cx="30" cy="140" rx="4" ry="12" fill="#1B1B1B" opacity="0.75" />}
            {gas && <><circle cx="26" cy="150" r="4" fill="#fff" opacity="0.9" /><rect x="18" y="118" width="24" height="5" fill="#F2F5F4" /></>}
          </>
        ) : (
          <>
            <path d="M18 46 L42 46 L42 166 Q42 181 30 181 Q18 181 18 166 Z" fill={bot} />
            {top !== bot && <path d="M18 46 L42 46 L42 92 L18 92 Z" fill={top} />}
            {motile && <ellipse cx="30" cy="120" rx="11" ry="34" fill="#FFFFFF" opacity="0.42" />}
            {(motile || testId === "miu" || testId === "motility") && <rect x="29" y="60" width="1.6" height="110" fill="#8C8B70" opacity={motile ? 0.35 : 0.9} />}
            {bubbles && <><circle cx="30" cy="172" r="5" fill="#fff" /><circle cx="24" cy="160" r="3" fill="#fff" opacity="0.8" /></>}
          </>
        )}
      </svg>
      <div className="vm-eyebrow" style={{ fontSize: 10, lineHeight: 1.35, marginTop: 2 }}>{t.name}</div>
    </div>
  );
}

/* 显微镜视野 */
function MicroField({ orgId }) {
  const gp = ORGS[orgId].gram.startsWith("G⁺");
  const cocci = ORGS[orgId].gram.includes("球菌");
  const color = gp ? "#4B2E83" : "#C43C5E";
  const r = rng(orgId.length * 977 + 13);
  const cells = [];
  for (let i = 0; i < (cocci ? 90 : 60); i++) {
    const x = 20 + r() * 260, y = 20 + r() * 260, a = r() * 180;
    cells.push({ x, y, a, id: i });
  }
  return (
    <svg viewBox="0 0 300 300" width="260" height="260" role="img" aria-label="油镜视野">
      <defs><clipPath id="fieldclip"><circle cx="150" cy="150" r="142" /></clipPath></defs>
      <circle cx="150" cy="150" r="145" fill="#0D1210" />
      <circle cx="150" cy="150" r="142" fill="#F3EFE6" />
      <g clipPath="url(#fieldclip)">
        {cells.map((c) =>
          cocci ? (
            <g key={c.id}>
              <circle cx={c.x} cy={c.y} r="3.4" fill={color} />
              <circle cx={c.x + 5} cy={c.y + 3} r="3.4" fill={color} />
              <circle cx={c.x + 2} cy={c.y + 7} r="3.4" fill={color} />
            </g>
          ) : (
            <rect key={c.id} x={c.x} y={c.y} width="12" height="4.2" rx="2.1" fill={color}
              transform={`rotate(${c.a} ${c.x + 6} ${c.y + 2})`} />
          )
        )}
      </g>
      <circle cx="150" cy="150" r="142" fill="none" stroke="#0D1210" strokeWidth="8" />
      <text x="150" y="288" textAnchor="middle" fontSize="12" fill="#5E6E69" fontFamily="IBM Plex Mono, monospace">油镜 100× · 革兰染色</text>
    </svg>
  );
}

/* ---------------------------- 7. 主应用 ---------------------------- */

const STAGES = [
  ["case", "病例"], ["specimen", "标本"], ["enrich", "增菌"], ["plating", "接种"],
  ["incubate1", "培养"], ["plates", "平板观察"], ["purity", "纯度确认"],
  ["biochem", "生化选择"], ["reading", "生化判读"], ["hypothesis", "假设"],
  ["serology", "血清学"], ["report", "报告"], ["debrief", "复盘"],
];

export default function App() {
  const [stage, setStage] = useState("intro");
  const [caseId, setCaseId] = useState(null);
  const [target, setTarget] = useState(null);
  const [seed, setSeed] = useState(1);

  const [specimen, setSpecimen] = useState(null);
  const [timing, setTiming] = useState(null);
  const [smear, setSmear] = useState(false);
  const [enrich, setEnrich] = useState(null);
  const [media, setMedia] = useState([]);
  const [streak, setStreak] = useState(null);
  const [temp, setTemp] = useState(null);
  const [hours, setHours] = useState(null);
  const [plates, setPlates] = useState(null);
  const [colonyForm, setColonyForm] = useState({});
  const [picked, setPicked] = useState(null);
  const [gramAns, setGramAns] = useState(null);
  const [tests, setTests] = useState([]);
  const [doneTests, setDoneTests] = useState([]);
  const [kiaTech, setKiaTech] = useState(null);
  const [readPh, setReadPh] = useState({});
  const [readV, setReadV] = useState({});
  const [hypo, setHypo] = useState([]);
  const [rounds, setRounds] = useState(1);
  const [serum, setSerum] = useState(null);
  const [finalAns, setFinalAns] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [simH, setSimH] = useState(0);
  const [cost, setCost] = useState(0);
  const [log, setLog] = useState([]);
  const [nbOpen, setNbOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [restreaks, setRestreaks] = useState(0);

  const C = caseId ? CASES[caseId] : null;
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4200); };
  const note = (k, v) => setLog((l) => [...l, { k, v, h: simH }]);

  function start() {
    const ids = Object.keys(CASES);
    const cid = ids[Math.floor(Math.random() * ids.length)];
    const c = CASES[cid];
    const tg = c.targets[Math.floor(Math.random() * c.targets.length)];
    setCaseId(cid); setTarget(tg); setSeed(Math.floor(Math.random() * 100000) + 7);
    setStage("case");
    setSpecimen(null); setTiming(null); setSmear(false); setEnrich(null); setMedia([]);
    setStreak(null); setTemp(null); setHours(null); setPlates(null); setColonyForm({});
    setPicked(null); setGramAns(null); setTests([]); setDoneTests([]); setKiaTech(null);
    setReadPh({}); setReadV({}); setHypo([]); setRounds(1); setSerum(null); setFinalAns(null);
    setEvidence([]); setSimH(0); setCost(0); setLog([]); setRestreaks(0);
  }

  /* 生成平板 */
  function incubate() {
    const y = C.yield(specimen, timing);
    let weights = [];
    if (y > 0) weights.push({ id: target, w: y });
    let flora = C.floraBySpecimen && C.floraBySpecimen[specimen] !== undefined ? C.floraBySpecimen[specimen] : C.flora;
    if (specimen === "blood" || specimen === "marrow") flora = [];
    weights = weights.concat(flora);
    // 增菌效果
    const e = ENRICH.find((x) => x.id === enrich);
    if (e && e.favors && e.favors.includes(target)) {
      weights = weights.map((w) => (w.id === target ? { ...w, w: w.w * 6 } : { ...w, w: Math.max(1, Math.round(w.w * 0.35)) }));
    }
    // 血标本必须先增菌
    if ((specimen === "blood" || specimen === "marrow") && !["broth", "sf"].includes(enrich)) {
      weights = [];
    }
    const ps = media.map((mid, i) => makePlate(mid, weights, streak, temp, hours, seed + i * 101));
    setPlates(ps);
    setSimH((h) => h + hours + (e ? e.hours : 0));
    setStage("plates");
    note("孵育", `${temp}℃ / ${HOURS.find((x) => x.id === hours).name}，接种 ${media.length} 块平板`);
  }

  function restreak() {
    setRestreaks((r) => r + 1);
    setSimH((h) => h + 24);
    setCost((c) => c + 8);
    const y = C.yield(specimen, timing);
    let weights = y > 0 ? [{ id: target, w: y }] : [];
    let flora = specimen === "blood" || specimen === "marrow" ? [] : C.flora;
    weights = weights.concat(flora);
    setStreak("quadrant");
    const ps = media.map((mid, i) => makePlate(mid, weights, "quadrant", 35, 20, seed + 555 + i * 101));
    setPlates(ps);
    setColonyForm({}); setPicked(null);
    note("重新划线", "改用分区划线法，35 ℃ 培养 24 小时，模拟时间 +24 h");
    say("已重新划线并培养 24 小时。模拟时间 +24 h，耗材 +8 元。");
  }

  /* 已完成试验的判读项 */
  const activeRo = useMemo(() => {
    const s = [];
    doneTests.forEach((t) => TESTS[t].ro.forEach((r) => { if (!s.includes(r)) s.push(r); }));
    return s;
  }, [doneTests]);

  const blockedRo = useMemo(() => {
    if (doneTests.includes("kia") && kiaTech === "slant") return ["kia_butt", "kia_gas", "kia_h2s"];
    if (doneTests.includes("kia") && kiaTech === "stab") return ["kia_slant"];
    return [];
  }, [doneTests, kiaTech]);

  const observed = useMemo(() => {
    const o = {};
    activeRo.forEach((r) => { if (!blockedRo.includes(r) && picked) o[r] = truth(picked.orgId, r); });
    return o;
  }, [activeRo, blockedRo, picked]);

  const cands = useMemo(() => candidates(observed), [observed]);

  function runTests() {
    const newOnes = tests.filter((t) => !doneTests.includes(t));
    const h = Math.max(0, ...newOnes.map((t) => TESTS[t].hours), 0);
    const c = newOnes.reduce((a, t) => a + TESTS[t].cost, 0);
    setSimH((x) => x + h); setCost((x) => x + c);
    setDoneTests((d) => [...d, ...newOnes]);
    note("生化接种", newOnes.map((t) => TESTS[t].name).join("、") + `（${h} 小时，${c} 元）`);
    setStage("reading");
  }

  /* -------- 评分 -------- */
  const score = useMemo(() => {
    if (!C || !target) return null;
    const ev = [];
    const add = (dim, label, got, max, note) => ev.push({ dim, label, got: Math.round(got * 10) / 10, max, note });

    // L1-1 标本与时机
    const sp = C.specimens.find((s) => s.id === specimen);
    const tm = C.timings.find((t) => t.id === timing);
    let s1 = 0;
    if (sp && sp.best) s1 += 3; else if (C.yield(specimen, timing) > 0) s1 += 1.5;
    if (tm && tm.best) s1 += 2; else if (C.yield(specimen, timing) > 0) s1 += 1;
    add("L1", "标本类型与采集时机", s1, 5,
      sp && sp.best && tm && tm.best ? "标本与时机均为首选" : `本例首选：${C.specimens.filter((x) => x.best).map((x) => x.name).join(" / ")}，${C.timings.filter((x) => x.best).map((x) => x.name).join(" / ")}`);

    // L1-2 增菌
    let s2 = 0;
    const eb = C.enrichBest;
    if (enrich === eb) s2 = 4;
    else if ((specimen === "blood" || specimen === "marrow") && ["broth", "sf"].includes(enrich)) s2 = 4;
    else if (enrich === "none" && eb === "none") s2 = 4;
    else if (enrich !== "none") s2 = 2;
    else s2 = 1;
    add("L1", "增菌方案", s2, 4, eb === "none" ? "本例标本含菌量高，可直接接种" : `本例宜用 ${ENRICH.find((x) => x.id === eb).name} 提高检出率`);

    // L1-3 培养基
    let s3 = 0;
    const good = media.filter((x) => MEDIA[x].good).length;
    const bad = media.filter((x) => !MEDIA[x].good).length;
    s3 = Math.min(6, good * 2.5) - Math.min(2, bad);
    if (media.includes("sda")) s3 -= 1;
    s3 = Math.max(0, s3);
    add("L1", "分离培养基选择", s3, 6, "肠道标本应同时使用弱选择（MAC/EMB）与强选择（SS）培养基");

    // L1-4 划线
    const s4 = streak === "quadrant" ? 4 : streak === "continuous" ? 2.5 : 0;
    add("L1", "划线方法与单菌落获得", Math.max(0, s4 - restreaks), 4, restreaks ? `重新划线 ${restreaks} 次` : "");

    // L1-5 孵育条件
    const s5 = (temp === 35 ? 2 : 0) + (hours === 20 ? 1 : 0);
    add("L1", "孵育温度与时间", s5, 3, "肠道杆菌标准条件为 35 ℃ 培养 18–24 小时");

    // L1-6 KIA 手法
    let s6 = 0;
    if (doneTests.includes("kia")) s6 = kiaTech === "both" ? 3 : kiaTech === "stab" ? 1 : 0.5;
    else s6 = 0;
    add("L1", "KIA 接种手法", s6, 3, doneTests.includes("kia") ? "正确手法：斜面划线 + 底层穿刺" : "未做 KIA，无法体现该操作");

    // L2-1 菌落形态判读
    let s7 = 0;
    if (picked) {
      const info = ORGS[picked.orgId].media[picked.plateId];
      const t = { size: info.size, lac: info.lac, black: info.black, tex: info.tex };
      ["size", "lac", "black", "tex"].forEach((k) => { if (colonyForm[k] === t[k]) s7 += 2; });
    }
    add("L2", "菌落形态判读", s7, 8, picked ? `所挑菌落实为${ORGS[picked.orgId].name}：${ORGS[picked.orgId].media[picked.plateId].desc}` : "未挑取菌落");

    // L2-2 革兰染色
    let s8 = 0;
    if (picked && gramAns) s8 = gramAns === ORGS[picked.orgId].gram ? 4 : 0;
    add("L2", "革兰染色判读", s8, 4, picked ? `正确答案：${ORGS[picked.orgId].gram}` : "");

    // L2-3 KIA 判读
    let s9 = 0;
    const kiaRo = ["kia_slant", "kia_butt", "kia_gas", "kia_h2s"];
    let kiaAvail = 0;
    kiaRo.forEach((r) => {
      if (!activeRo.includes(r) || blockedRo.includes(r)) return;
      kiaAvail++;
      const tv = truth(picked ? picked.orgId : target, r);
      if (readPh[r] === tv) s9 += 1.25;
      if (readV[r] === tv) s9 += 1.25;
    });
    add("L2", "KIA 四项判读（现象 + 结论）", s9, 10, kiaAvail < 4 ? `仅 ${kiaAvail} 项可判读，其余因未做或接种手法不当而缺失` : "");

    // L2-4 其他生化判读
    let s10 = 0, otherN = 0;
    activeRo.forEach((r) => {
      if (kiaRo.includes(r) || blockedRo.includes(r)) return;
      otherN++;
      const tv = truth(picked ? picked.orgId : target, r);
      if (readPh[r] === tv) s10 += 0.5;
      if (readV[r] === tv) s10 += 0.5;
    });
    if (otherN > 0 && otherN < 4) s10 = s10 * (4 / otherN) * 0.75; // 项目过少时按比例折算
    s10 = Math.min(8, s10);
    add("L2", "其他生化项判读（现象 + 结论）", s10, 8, `共判读 ${otherN} 项`);

    // L3-1 挑取菌落
    let s11 = 0;
    if (picked) s11 = picked.orgId === target ? 6 : ORGS[picked.orgId].genus === ORGS[target].genus ? 3 : 0;
    add("L3", "目标菌落的识别与挑取", s11, 6,
      picked && picked.orgId !== target ? `所挑为${ORGS[picked.orgId].name}，而本例致病菌为${ORGS[target].name}` : "");

    // L3-2 假设面板逻辑
    const trueCands = cands;
    let s12 = 0;
    if (hypo.length) {
      const hit = hypo.filter((h) => trueCands.includes(h)).length;
      const miss = hypo.filter((h) => !trueCands.includes(h)).length;
      s12 = Math.max(0, Math.min(6, (hit / Math.max(1, trueCands.length)) * 6 - miss * 1.5));
    }
    add("L3", "候选菌排除逻辑", s12, 6, `依据你已获得的结果，逻辑上尚不能排除：${trueCands.map((c) => ORGS[c].name).join("、") || "无"}`);

    // L3-3 最终菌名
    let s13 = 0;
    if (finalAns === target) s13 = 12;
    else if (finalAns && ORGS[finalAns] && ORGS[finalAns].genus === ORGS[target].genus) s13 = 7;
    else if (finalAns === "unknown" && C.yield(specimen, timing) === 0) s13 = 4;
    add("L3", "最终鉴定结论", s13, 12, `本例致病菌：${ORGS[target].name}（${ORGS[target].short}）`);

    // L3-4 报告依据
    const key = minimalPath(target);
    const hitKey = evidence.filter((e) => key.includes(e)).length;
    let s14 = key.length ? Math.min(6, (hitKey / key.length) * 6) : 0;
    if (evidence.filter((e) => !key.includes(e)).length > 3) s14 = Math.max(0, s14 - 1);
    add("L3", "报告依据的针对性", s14, 6, `关键鉴别依据：${key.map((k) => READOUTS[k].label).join("、")}`);

    // 效率
    const costScore = cost <= 20 ? 5 : cost <= 32 ? 4 : cost <= 45 ? 2.5 : 1;
    add("EFF", "试剂与耗材消耗", costScore, 5, `本局共消耗 ${cost} 元`);
    const hScore = simH <= 48 ? 5 : simH <= 72 ? 4 : simH <= 96 ? 2.5 : 1;
    add("EFF", "模拟总耗时", hScore, 5, `本局模拟耗时 ${simH} 小时`);
    const redundant = Math.max(0, activeRo.length - key.length - 3);
    const rScore = Math.max(0, 5 - redundant * 0.8 - (rounds - 1) * 1 - restreaks * 1);
    add("EFF", "试验冗余与返工", rScore, 5, `共做 ${activeRo.length} 个判读项，最少充分组合为 ${key.length} 项；追加轮次 ${rounds - 1} 次`);

    // 扣分
    const pen = [];
    if (!gramAns) pen.push({ n: -3, why: "未做革兰染色与纯度确认即进入生化试验" });
    if (!doneTests.includes("oxidase") && target === "pseudo") pen.push({ n: -6, why: "对非发酵菌未做氧化酶试验，属于路径性失误" });
    if (finalAns && ORGS[finalAns] && ORGS[finalAns].genus.indexOf("非肠杆菌") === -1 && truth(picked ? picked.orgId : target, "oxidase") === "+" && doneTests.includes("oxidase"))
      pen.push({ n: -10, why: "氧化酶阳性仍报告为肠杆菌科细菌，属原则性错误" });
    if (serum && serum !== "none" && !ANTISERA.find((a) => a.id === serum).hits.includes(target) && finalAns === target)
      pen.push({ n: -2, why: "血清学凝集阴性，却未在报告中说明该矛盾" });

    const dims = { L1: 0, L2: 0, L3: 0, EFF: 0 };
    ev.forEach((e) => { dims[e.dim] += e.got; });
    const penSum = pen.reduce((a, b) => a + b.n, 0);
    const total = Math.max(0, Math.min(100, dims.L1 + dims.L2 + dims.L3 + dims.EFF + penSum));
    return { ev, dims, pen, penSum, total: Math.round(total * 10) / 10, key };
  }, [C, target, specimen, timing, enrich, media, streak, temp, hours, picked, colonyForm, gramAns,
      doneTests, kiaTech, readPh, readV, activeRo, blockedRo, hypo, cands, finalAns, evidence, cost, simH, rounds, restreaks, serum]);

  /* -------- 渲染 -------- */
  const stageIdx = STAGES.findIndex((s) => s[0] === stage);

  return (
    <div className="vm-root">
      <style>{CSS}</style>

      <header className="vm-head">
        <div className="vm-headin">
          <div className="vm-title">肠道杆菌的分离培养与生化鉴定</div>
          <span className="vm-eyebrow" style={{ color: "#8AA098" }}>虚拟仿真实验 · 决策模式</span>
          <div className="vm-meta">
            {C && <span>病例 <b>{C.id}</b></span>}
            <span>模拟时间 <b>{simH} h</b></span>
            <span>耗材 <b>¥{cost}</b></span>
            {picked && <span>纯培养 <b>已获得</b></span>}
          </div>
        </div>
        {stage !== "intro" && (
          <div className="vm-steps"><div className="vm-stepsin">
            {STAGES.map((s, i) => (
              <div key={s[0]} className={"vm-step" + (i === stageIdx ? " on" : i < stageIdx ? " done" : "")}>
                {String(i + 1).padStart(2, "0")} {s[1]}
              </div>
            ))}
          </div></div>
        )}
      </header>

      <div className="vm-wrap">
        {stage === "intro" && <Intro onStart={start} />}

        {stage === "case" && C && (
          <div className="vm-card">
            <div className="vm-eyebrow">病例 {C.id} · 检验申请单</div>
            <h2 className="vm-h2">{C.title}</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{C.history}</p>
            <div className="vm-note">
              本实验不会在过程中提示对错。你的每一个选择都会产生真实的实验结果，请像在真实实验室一样，用结果本身来判断下一步。
              实验记录本随时可查（右下角按钮）。
            </div>
            <div className="vm-bar">
              <button className="vm-btn" onClick={() => setStage("specimen")}>接收标本，开始实验</button>
            </div>
          </div>
        )}

        {stage === "specimen" && C && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 02 · 标本</div>
            <h2 className="vm-h2">选择标本类型与采集时机</h2>
            <p className="vm-sub">标本选错或时机不当，不会有任何提示，但会直接影响后续能否分离到致病菌。</p>
            <h3 className="vm-h3">标本类型</h3>
            <div className="vm-grid vm-g2">
              {C.specimens.map((s) => <Opt key={s.id} sel={specimen === s.id} title={s.name} onClick={() => setSpecimen(s.id)} />)}
            </div>
            <h3 className="vm-h3">采集时机</h3>
            <div className="vm-grid vm-g2">
              {C.timings.map((t) => <Opt key={t.id} sel={timing === t.id} title={t.name} onClick={() => setTiming(t.id)} />)}
            </div>
            <h3 className="vm-h3">是否先做标本直接涂片革兰染色</h3>
            <div className="vm-grid vm-g2">
              <Opt sel={smear === true} title="做直接涂片（+2 元，+0.5 h）" sub="可了解菌量与炎症细胞，但不能据此鉴定菌种" onClick={() => setSmear(true)} />
              <Opt sel={smear === false} title="不做直接涂片" onClick={() => setSmear(false)} />
            </div>
            {smear && specimen && (
              <div className="vm-note">
                直接涂片镜检：{specimen === "blood" || specimen === "marrow"
                  ? "未见细菌，可见大量血细胞。"
                  : specimen === "deep" || specimen === "surface"
                  ? "见大量中性粒细胞，可见 G⁻杆菌及少量 G⁺球菌。"
                  : "见较多中性粒细胞与吞噬细胞，可见大量 G⁻杆菌（无法据此区分菌属）。"}
              </div>
            )}
            <div className="vm-bar">
              <button className="vm-btn" disabled={!specimen || !timing} onClick={() => {
                setSimH((h) => h + (smear ? 0.5 : 0)); setCost((c) => c + (smear ? 2 : 0));
                note("标本", `${C.specimens.find((s) => s.id === specimen).name}；${C.timings.find((t) => t.id === timing).name}`);
                setStage("enrich");
              }}>确认标本</button>
            </div>
          </div>
        )}

        {stage === "enrich" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 03 · 增菌</div>
            <h2 className="vm-h2">选择增菌方案</h2>
            <p className="vm-sub">增菌可提高低含菌量标本的检出率，但会增加培养时间。无菌部位标本（血液、骨髓）必须先增菌。</p>
            <div className="vm-grid vm-g2">
              {ENRICH.map((e) => (
                <Opt key={e.id} sel={enrich === e.id} title={e.name}
                  sub={`+${e.hours} 小时 · ${e.cost} 元`} onClick={() => setEnrich(e.id)} />
              ))}
            </div>
            <div className="vm-bar">
              <button className="vm-btn" disabled={!enrich} onClick={() => {
                const e = ENRICH.find((x) => x.id === enrich);
                setCost((c) => c + e.cost);
                note("增菌", e.name);
                setStage("plating");
              }}>确认增菌方案</button>
            </div>
          </div>
        )}

        {stage === "plating" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 04 · 接种</div>
            <h2 className="vm-h2">选择分离培养基与划线方法</h2>
            <p className="vm-sub">最多可同时接种 3 块平板，每块 4 元。</p>
            <div className="vm-grid vm-g2">
              {Object.keys(MEDIA).map((k) => (
                <Opt key={k} sel={media.includes(k)} title={`${MEDIA[k].name}（${MEDIA[k].abbr}）`}
                  sub={`${MEDIA[k].kind} · ${MEDIA[k].note}`}
                  onClick={() => setMedia((ms) => ms.includes(k) ? ms.filter((x) => x !== k) : ms.length >= 3 ? (say("最多同时接种 3 块平板。"), ms) : [...ms, k])} />
              ))}
            </div>
            <h3 className="vm-h3">划线方法</h3>
            <div className="vm-grid vm-g3">
              {STREAKS.map((s) => <Opt key={s.id} sel={streak === s.id} title={s.name} sub={s.desc} onClick={() => setStreak(s.id)} />)}
            </div>
            <div className="vm-bar">
              <button className="vm-btn" disabled={!media.length || !streak} onClick={() => {
                setCost((c) => c + media.length * 4);
                note("接种", `${media.map((k) => MEDIA[k].abbr).join(" / ")}；${STREAKS.find((s) => s.id === streak).name}`);
                setStage("incubate1");
              }}>接种平板</button>
            </div>
          </div>
        )}

        {stage === "incubate1" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 05 · 培养箱</div>
            <h2 className="vm-h2">设定孵育条件</h2>
            <p className="vm-sub">温度与时间会同时影响菌落大小、数量与可判读性。</p>
            <h3 className="vm-h3">温度</h3>
            <div className="vm-grid vm-g3">{TEMPS.map((t) => <Opt key={t.id} sel={temp === t.id} title={t.name} onClick={() => setTemp(t.id)} />)}</div>
            <h3 className="vm-h3">时间</h3>
            <div className="vm-grid vm-g3">{HOURS.map((t) => <Opt key={t.id} sel={hours === t.id} title={t.name} onClick={() => setHours(t.id)} />)}</div>
            <div className="vm-bar">
              <button className="vm-btn" disabled={!temp || !hours} onClick={incubate}>放入培养箱并快进</button>
            </div>
          </div>
        )}

        {stage === "plates" && plates && (
          <PlatesStage
            plates={plates} picked={picked} setPicked={setPicked}
            colonyForm={colonyForm} setColonyForm={setColonyForm}
            onRestreak={restreak} say={say} note={note}
            onNext={() => setStage("purity")}
            onNoGrowth={() => setStage("report")}
          />
        )}

        {stage === "purity" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 07 · 显微镜与纯度确认</div>
            <h2 className="vm-h2">纯培养确认</h2>
            <p className="vm-sub">对所挑菌落做革兰染色镜检，并可加做氧化酶试验判断是否属于肠杆菌科。</p>
            {picked ? (
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <MicroField orgId={picked.orgId} />
                <div style={{ flex: "1 1 300px", minWidth: 260 }}>
                  <h3 className="vm-h3">镜下所见属于</h3>
                  <div className="vm-grid">
                    {["G⁻杆菌", "G⁻粗短杆菌", "G⁻细长杆菌", "G⁻多形性杆菌", "G⁺杆菌", "G⁺球菌（葡萄串状）"].map((g) => (
                      <Opt key={g} sel={gramAns === g} title={g} onClick={() => setGramAns(g)} />
                    ))}
                  </div>
                  <h3 className="vm-h3">氧化酶试验</h3>
                  {doneTests.includes("oxidase") ? (
                    <div className="vm-note">
                      氧化酶试验结果：{READOUTS.oxidase.ph[truth(picked.orgId, "oxidase")]}
                    </div>
                  ) : (
                    <button className="vm-btn alt" onClick={() => {
                      setDoneTests((d) => [...d, "oxidase"]); setTests((t) => [...t, "oxidase"]);
                      setCost((c) => c + 2);
                      note("氧化酶", READOUTS.oxidase.ph[truth(picked.orgId, "oxidase")]);
                    }}>做氧化酶试验（2 元，1 分钟）</button>
                  )}
                </div>
              </div>
            ) : <p>尚未挑取菌落。</p>}
            <div className="vm-bar">
              <button className="vm-btn" onClick={() => {
                if (gramAns) note("革兰染色", gramAns);
                setStage(picked ? "biochem" : "report");
              }}>{picked ? "进入生化试验区" : "无纯培养物，直接签发报告"}</button>
              <span className="vm-tag">未做染色也可继续，但会影响评分</span>
            </div>
          </div>
        )}

        {stage === "biochem" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 08 · 生化试验区</div>
            <h2 className="vm-h2">选择生化试验项目</h2>
            <p className="vm-sub">选得越多不代表越好——试剂消耗与耗时都计入成绩。已完成的项目不会重复计费。</p>
            <div className="vm-grid vm-g2">
              {Object.keys(TESTS).filter((k) => k !== "oxidase" || !doneTests.includes("oxidase")).map((k) => (
                <Opt key={k} sel={tests.includes(k) || doneTests.includes(k)} disabled={doneTests.includes(k)}
                  title={TESTS[k].name}
                  sub={`${TESTS[k].cost} 元 · ${TESTS[k].hours} 小时${TESTS[k].tip ? " · " + TESTS[k].tip : ""}${doneTests.includes(k) ? " · 已完成" : ""}`}
                  onClick={() => setTests((ts) => ts.includes(k) ? ts.filter((x) => x !== k) : [...ts, k])} />
              ))}
            </div>
            {tests.includes("kia") && !doneTests.includes("kia") && (
              <>
                <h3 className="vm-h3">KIA 接种手法</h3>
                <div className="vm-grid vm-g3">
                  <Opt sel={kiaTech === "both"} title="斜面划线 + 底层穿刺" onClick={() => setKiaTech("both")} />
                  <Opt sel={kiaTech === "slant"} title="仅斜面划线" onClick={() => setKiaTech("slant")} />
                  <Opt sel={kiaTech === "stab"} title="仅底层穿刺" onClick={() => setKiaTech("stab")} />
                </div>
              </>
            )}
            <div className="vm-bar">
              <button className="vm-btn" disabled={!tests.filter((t) => !doneTests.includes(t)).length || (tests.includes("kia") && !doneTests.includes("kia") && !kiaTech)}
                onClick={runTests}>接种并培养</button>
              {doneTests.length > 0 && <button className="vm-btn alt" onClick={() => setStage("reading")}>返回结果判读</button>}
            </div>
          </div>
        )}

        {stage === "reading" && picked && (
          <ReadingStage
            doneTests={doneTests} orgId={picked.orgId} blockedRo={blockedRo}
            readPh={readPh} setReadPh={setReadPh} readV={readV} setReadV={setReadV}
            kiaTech={kiaTech}
            onNext={() => { note("生化判读", `已完成 ${activeRo.length} 项判读`); setStage("hypothesis"); }}
          />
        )}

        {stage === "hypothesis" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 10 · 假设面板</div>
            <h2 className="vm-h2">列出你目前尚不能排除的候选菌</h2>
            <p className="vm-sub">系统不会告诉你对错。请回到记录本核对每一条结果，勾选所有与你的结果不矛盾的菌。</p>
            <div className="vm-grid vm-g2">
              {ALL_ORGS.map((o) => (
                <Opt key={o} sel={hypo.includes(o)} title={`${ORGS[o].name}（${ORGS[o].short}）`} sub={ORGS[o].genus}
                  onClick={() => setHypo((h) => h.includes(o) ? h.filter((x) => x !== o) : [...h, o])} />
              ))}
            </div>
            <div className="vm-bar">
              <button className="vm-btn alt" onClick={() => { setRounds((r) => r + 1); setTests(doneTests.slice()); setStage("biochem"); }}>
                返回追加生化试验
              </button>
              <button className="vm-btn" disabled={!hypo.length} onClick={() => { note("候选菌假设", hypo.map((h) => ORGS[h].name).join("、")); setStage("serology"); }}>
                进入血清学鉴定
              </button>
            </div>
          </div>
        )}

        {stage === "serology" && picked && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 11 · 玻片凝集</div>
            <h2 className="vm-h2">选择诊断血清</h2>
            <p className="vm-sub">选错血清不会得到提示，只会得到一个阴性结果。</p>
            <div className="vm-grid vm-g2">
              {ANTISERA.map((a) => <Opt key={a.id} sel={serum === a.id} title={a.name} onClick={() => setSerum(a.id)} />)}
            </div>
            {serum && serum !== "none" && (
              <div className="vm-note">
                玻片凝集结果：{ANTISERA.find((a) => a.id === serum).hits.includes(picked.orgId)
                  ? "1 分钟内出现明显颗粒状凝集，生理盐水对照不凝集 —— 阳性。"
                  : "液体保持均匀混浊，未见凝集颗粒 —— 阴性。"}
              </div>
            )}
            <div className="vm-bar">
              <button className="vm-btn" disabled={!serum} onClick={() => {
                if (serum !== "none") {
                  setCost((c) => c + 6);
                  note("血清学", `${ANTISERA.find((a) => a.id === serum).name}：${ANTISERA.find((a) => a.id === serum).hits.includes(picked.orgId) ? "凝集阳性" : "凝集阴性"}`);
                }
                setStage("report");
              }}>提交凝集结果</button>
            </div>
          </div>
        )}

        {stage === "report" && (
          <div className="vm-card">
            <div className="vm-eyebrow">步骤 12 · 检验报告</div>
            <h2 className="vm-h2">签发最终鉴定报告</h2>
            <h3 className="vm-h3">鉴定结论</h3>
            <div className="vm-grid vm-g2">
              {ALL_ORGS.map((o) => <Opt key={o} sel={finalAns === o} title={ORGS[o].name} sub={ORGS[o].short} onClick={() => setFinalAns(o)} />)}
              <Opt sel={finalAns === "unknown"} title="未检出致病菌 / 无法鉴定" onClick={() => setFinalAns("unknown")} />
            </div>
            <h3 className="vm-h3">支持该结论的关键依据（多选）</h3>
            <div className="vm-grid vm-g3">
              {activeRo.filter((r) => !blockedRo.includes(r)).map((r) => (
                <Opt key={r} sel={evidence.includes(r)} title={READOUTS[r].label}
                  sub={picked ? READOUTS[r].cn[truth(picked.orgId, r)] : ""}
                  onClick={() => setEvidence((e) => e.includes(r) ? e.filter((x) => x !== r) : [...e, r])} />
              ))}
            </div>
            <div className="vm-bar">
              <button className="vm-btn" disabled={!finalAns} onClick={() => setStage("debrief")}>签发报告并进入复盘</button>
            </div>
          </div>
        )}

        {stage === "debrief" && score && (
          <Debrief score={score} C={C} target={target} picked={picked} observed={observed}
            activeRo={activeRo} blockedRo={blockedRo} log={log} onRestart={start}
            onReplay={() => { const t = target, c = caseId; start(); setTimeout(() => { setCaseId(c); setTarget(t); setStage("case"); }, 0); }} />
        )}
      </div>

      {stage !== "intro" && (
        <button className="vm-nbtoggle" onClick={() => setNbOpen((v) => !v)}>{nbOpen ? "收起记录本" : "实验记录本"}</button>
      )}
      {nbOpen && (
        <aside className="vm-nb">
          <div className="vm-eyebrow">实验记录本</div>
          <h3 className="vm-h3" style={{ marginTop: 4 }}>操作与结果</h3>
          <table className="vm-tbl">
            <thead><tr><th style={{ width: 54 }}>时刻</th><th style={{ width: 80 }}>项目</th><th>内容</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan="3" style={{ color: "#5E6E69" }}>尚无记录。</td></tr>}
              {log.map((l, i) => <tr key={i}><td className="m">{l.h}h</td><td>{l.k}</td><td>{l.v}</td></tr>)}
            </tbody>
          </table>
          {picked && activeRo.length > 0 && (
            <>
              <h3 className="vm-h3">生化结果汇总</h3>
              <table className="vm-tbl">
                <thead><tr><th>项目</th><th>现象</th><th>结论</th></tr></thead>
                <tbody>
                  {activeRo.map((r) => (
                    <tr key={r}>
                      <td>{READOUTS[r].label}</td>
                      <td>{blockedRo.includes(r) ? "结果不可判读" : READOUTS[r].ph[truth(picked.orgId, r)]}</td>
                      <td className="m">{blockedRo.includes(r) ? "—" : (readV[r] ? READOUTS[r].cn[readV[r]] : "未填写")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </aside>
      )}
      {toast && <div className="vm-toast">{toast}</div>}
    </div>
  );
}

/* ---------------------------- 8. 分阶段子组件 ---------------------------- */

function Intro({ onStart }) {
  return (
    <>
      <div className="vm-card" style={{ marginTop: 24 }}>
        <div className="vm-eyebrow">医学微生物学 · 综合性实验</div>
        <h1 className="vm-h2" style={{ fontSize: 34, lineHeight: 1.25 }}>肠道杆菌的分离培养与生化鉴定</h1>
        <p className="vm-sub" style={{ fontSize: 15 }}>
          这不是一段按“下一步”播放的动画。你会拿到一份真实的临床病例，然后自己决定采什么标本、用什么培养基、
          挑哪一个菌落、做哪几项生化试验。选错不会有红色提示——只会得到那个选择本该产生的实验结果。
        </p>
        <div className="vm-grid vm-g3" style={{ marginTop: 18 }}>
          {[
            ["实验操作", "标本采集时机、培养基选择、划线分离、KIA 穿刺接种、孵育条件"],
            ["结果判读", "菌落形态、革兰染色像、KIA 四联反应、各生化管显色，现象与结论分别作答"],
            ["综合推理", "用多项结果交叉排除，提出候选菌，选择诊断血清，签发鉴定报告"],
          ].map(([t, d], i) => (
            <div key={t} style={{ borderTop: "2px solid #17211E", paddingTop: 10 }}>
              <div className="vm-eyebrow">层次 0{i + 1}</div>
              <div style={{ fontWeight: 700, fontFamily: "'IBM Plex Sans Condensed',sans-serif", fontSize: 17, margin: "2px 0 4px" }}>{t}</div>
              <div style={{ fontSize: 13, color: "#5E6E69" }}>{d}</div>
            </div>
          ))}
        </div>
        <div className="vm-note">
          全部实验结果来自预先定义的医学微生物学知识库（9 株菌 × 6 种培养基 × 19 个判读项）。同一菌株、同一操作，结果永远一致。
        </div>
        <div className="vm-bar">
          <button className="vm-btn" onClick={onStart}>随机抽取病例，开始实验</button>
        </div>
      </div>
    </>
  );
}

function PlatesStage({ plates, picked, setPicked, colonyForm, setColonyForm, onRestreak, say, note, onNext, onNoGrowth }) {
  const anyPickable = plates.some((p) => p.colonies.some((c) => c.pickable));
  const allEmpty = plates.every((p) => p.empty);
  const FORM = [
    ["size", "菌落大小", ["针尖状", "细小", "中等", "较大"]],
    ["lac", "乳糖分解情况", ["分解", "不分解", "不含乳糖"]],
    ["black", "菌落中心黑点", ["有", "微", "无"]],
    ["tex", "菌落质地", ["干燥", "湿润", "黏液状拉丝", "迁徙生长"]],
  ];
  return (
    <div className="vm-card">
      <div className="vm-eyebrow">步骤 06 · 工作台</div>
      <h2 className="vm-h2">观察平板并挑取单个菌落</h2>
      <p className="vm-sub">先判读菌落形态，再点击你认为的可疑致病菌菌落。只有分离良好的单个菌落可以挑取。</p>
      <div className="vm-plates">
        {plates.map((p) => <Petri key={p.mediumId} plate={p} picked={picked}
          onPick={(c) => {
            if (!c.pickable) { say("该区域菌落密集融合，无法挑取纯培养物。请到划线稀释良好的区域挑取。"); return; }
            setPicked({ plateId: p.mediumId, colonyId: c.id, orgId: c.orgId });
            note("挑取菌落", `自 ${MEDIA[p.mediumId].abbr} 平板挑取单个菌落`);
          }} />)}
      </div>
      {!anyPickable && (
        <>
          <div className="vm-note">
            {allEmpty
              ? "全部平板均未见细菌生长，没有可供挑取的菌落。请回顾标本类型、采集时机、增菌方案与孵育条件——重复培养并不会改变这一结果。"
              : "当前平板上没有可挑取的单个菌落。你可以重新划线传代（模拟时间 +24 小时）。"}
          </div>
          <div className="vm-bar" style={{ marginTop: 0 }}>
            {!allEmpty && <button className="vm-btn alt" onClick={onRestreak}>重新划线并培养</button>}
            <button className="vm-btn" onClick={() => { note("培养结果", "平板无致病菌生长，直接签发报告"); onNoGrowth(); }}>
              结束培养，签发报告
            </button>
          </div>
        </>
      )}
      {picked && (
        <>
          <h3 className="vm-h3">记录所挑菌落的形态（{MEDIA[picked.plateId].abbr} 平板）</h3>
          <div className="vm-grid vm-g2">
            {FORM.map(([k, label, opts]) => (
              <div key={k}>
                <div className="vm-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
                <select className="vm-sel" value={colonyForm[k] || ""} onChange={(e) => setColonyForm({ ...colonyForm, [k]: e.target.value })}>
                  <option value="">请选择</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="vm-bar">
            <button className="vm-btn" disabled={FORM.some(([k]) => !colonyForm[k])}
              onClick={() => { note("菌落形态", FORM.map(([k, l]) => `${l}：${colonyForm[k]}`).join("；")); onNext(); }}>
              转种纯培养并进入镜检
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReadingStage({ doneTests, orgId, blockedRo, readPh, setReadPh, readV, setReadV, kiaTech, onNext }) {
  const shown = doneTests;
  const allRo = [];
  shown.forEach((t) => TESTS[t].ro.forEach((r) => { if (!allRo.includes(r)) allRo.push(r); }));
  const need = allRo.filter((r) => !blockedRo.includes(r));
  const done = need.every((r) => readPh[r] && readV[r]);
  return (
    <div className="vm-card">
      <div className="vm-eyebrow">步骤 09 · 生化试验区</div>
      <h2 className="vm-h2">判读各管结果</h2>
      <p className="vm-sub">先描述你看到的现象，再写出结论。这两项分别计分——看对现象不等于判对结论。</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "12px 0 18px", borderBottom: "1px solid #B7C3BE" }}>
        {shown.map((t) => <Tube key={t} testId={t} orgId={orgId} blocked={t === "kia" && kiaTech === "slant"} />)}
      </div>
      {kiaTech === "slant" && doneTests.includes("kia") && (
        <div className="vm-note">KIA 仅做斜面划线、未穿刺底层，底层反应、产气与 H₂S 均无法判读。</div>
      )}
      <table className="vm-tbl" style={{ marginTop: 14 }}>
        <thead><tr><th style={{ width: "20%" }}>判读项</th><th style={{ width: "40%" }}>你观察到的现象</th><th style={{ width: "40%" }}>你的结论</th></tr></thead>
        <tbody>
          {allRo.map((r) => {
            const R = READOUTS[r];
            const blocked = blockedRo.includes(r);
            return (
              <tr key={r}>
                <td style={{ fontWeight: 600 }}>{R.label}</td>
                <td>
                  {blocked ? <span style={{ color: "#5E6E69" }}>结果不可判读</span> : (
                    <select className="vm-sel" value={readPh[r] || ""} onChange={(e) => setReadPh({ ...readPh, [r]: e.target.value })}>
                      <option value="">请选择现象</option>
                      {Object.keys(R.ph).map((k) => <option key={k} value={k}>{R.ph[k]}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {blocked ? <span style={{ color: "#5E6E69" }}>—</span> : (
                    <select className="vm-sel" value={readV[r] || ""} onChange={(e) => setReadV({ ...readV, [r]: e.target.value })}>
                      <option value="">请选择结论</option>
                      {Object.keys(R.cn).map((k) => <option key={k} value={k}>{R.cn[k]}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="vm-bar">
        <button className="vm-btn" disabled={!done} onClick={onNext}>完成判读，进入推理</button>
        {!done && <span className="vm-tag">请完成全部现象与结论的填写</span>}
      </div>
    </div>
  );
}

function Debrief({ score, C, target, picked, observed, activeRo, blockedRo, log, onRestart, onReplay }) {
  const pickedOrg = picked ? picked.orgId : null;
  const key = score.key;
  // 排除树
  let remain = ALL_ORGS.slice();
  const tree = activeRo.filter((r) => !blockedRo.includes(r)).map((r) => {
    const v = truth(pickedOrg || target, r);
    const before = remain.slice();
    remain = remain.filter((o) => truth(o, r) === v);
    return { ro: r, v, out: before.filter((o) => !remain.includes(o)), left: remain.slice() };
  });
  const decisiveIdx = tree.findIndex((t) => t.left.length === 1);
  const dimName = { L1: "实验操作", L2: "结果判读", L3: "综合推理", EFF: "效率与资源" };
  const dimMax = { L1: 25, L2: 30, L3: 30, EFF: 15 };

  return (
    <>
      <div className="vm-card">
        <div className="vm-eyebrow">复盘 · 病例 {C.id}</div>
        <h2 className="vm-h2">本例致病菌：{ORGS[target].name}（{ORGS[target].short}）</h2>
        <p className="vm-sub">{C.key}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "18px 0 10px" }}>
          <span className="vm-mono" style={{ fontSize: 52, fontWeight: 600, color: "#B3204A", lineHeight: 1 }}>{score.total}</span>
          <span className="vm-eyebrow">/ 100 分</span>
        </div>
        <div className="vm-grid vm-g2">
          {["L1", "L2", "L3", "EFF"].map((d) => (
            <div key={d}>
              <div className="vm-score" style={{ fontSize: 13, justifyContent: "space-between" }}>
                <span>{dimName[d]}</span><span>{Math.round(score.dims[d] * 10) / 10} / {dimMax[d]}</span>
              </div>
              <div className="vm-meter"><i style={{ width: `${Math.min(100, (score.dims[d] / dimMax[d]) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="vm-card">
        <h3 className="vm-h3" style={{ marginTop: 0 }}>推理链回放 · 每一步排除了谁</h3>
        {tree.length === 0 ? <p className="vm-sub">未获得可用的生化结果，无法构建排除链。</p> : (
          <div className="vm-tree">
            {tree.map((t, i) => (
              <div className="vm-treeitem" key={t.ro}>
                <div style={{ fontWeight: 600 }}>
                  {READOUTS[t.ro].label}：{READOUTS[t.ro].cn[t.v]}
                  {i === decisiveIdx && <span className="vm-chip in" style={{ marginLeft: 8 }}>此步已可定案</span>}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>
                  {t.out.length ? <>排除：{t.out.map((o) => <span key={o} className="vm-chip out">{ORGS[o].name}</span>)}</> : <span style={{ color: "#5E6E69" }}>本项未排除任何菌种（对本次鉴定无鉴别价值）</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "#5E6E69", marginTop: 2 }}>剩余候选 {t.left.length} 种</div>
              </div>
            ))}
          </div>
        )}
        {decisiveIdx >= 0 && decisiveIdx < tree.length - 1 && (
          <div className="vm-note">
            你在第 {decisiveIdx + 1} 项判读后逻辑上已可定案，其后仍做了 {tree.length - decisiveIdx - 1} 项试验。
            临床工作中这部分属于可节省的成本与时间。
          </div>
        )}
      </div>

      <div className="vm-card">
        <h3 className="vm-h3" style={{ marginTop: 0 }}>最少充分路径</h3>
        <p className="vm-sub">对本例致病菌而言，从 9 株候选菌中定案所需的最短鉴别组合：</p>
        <div>{key.map((k) => <span key={k} className="vm-chip in">{READOUTS[k].label} = {READOUTS[k].cn[truth(target, k)]}</span>)}</div>
      </div>

      {pickedOrg && pickedOrg !== target && (
        <div className="vm-card">
          <h3 className="vm-h3" style={{ marginTop: 0 }}>平行对照 · 如果你挑的是另一个菌落</h3>
          <p className="vm-sub">你挑取的是{ORGS[pickedOrg].name}，本例致病菌是{ORGS[target].name}。两者在关键项目上的差别：</p>
          <table className="vm-tbl">
            <thead><tr><th>判读项</th><th>你挑取的 {ORGS[pickedOrg].name}</th><th>应挑取的 {ORGS[target].name}</th></tr></thead>
            <tbody>
              {Array.from(new Set([...activeRo, ...key])).filter((r) => truth(pickedOrg, r) !== truth(target, r)).map((r) => (
                <tr key={r}>
                  <td>{READOUTS[r].label}</td>
                  <td className="m">{READOUTS[r].cn[truth(pickedOrg, r)]}</td>
                  <td className="m">{READOUTS[r].cn[truth(target, r)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="vm-note">
            在 {MEDIA[picked.plateId].name} 上，{ORGS[target].name}应表现为：{ORGS[target].media[picked.plateId].desc}。
          </div>
        </div>
      )}

      <div className="vm-card">
        <h3 className="vm-h3" style={{ marginTop: 0 }}>逐项评分与失误归因</h3>
        <table className="vm-tbl">
          <thead><tr><th style={{ width: 88 }}>层次</th><th>评分点</th><th style={{ width: 74 }}>得分</th><th>说明</th></tr></thead>
          <tbody>
            {score.ev.map((e, i) => (
              <tr key={i}>
                <td>{dimName[e.dim]}</td>
                <td>{e.label}</td>
                <td className="m">{e.got} / {e.max}</td>
                <td style={{ fontSize: 12.5, color: "#5E6E69" }}>{e.note}</td>
              </tr>
            ))}
            {score.pen.map((p, i) => (
              <tr key={"p" + i}>
                <td>扣分</td><td>原则性问题</td><td className="m" style={{ color: "#B3204A" }}>{p.n}</td>
                <td style={{ fontSize: 12.5 }}>{p.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vm-card">
        <h3 className="vm-h3" style={{ marginTop: 0 }}>本局完整操作记录</h3>
        <table className="vm-tbl">
          <thead><tr><th style={{ width: 60 }}>时刻</th><th style={{ width: 90 }}>项目</th><th>内容</th></tr></thead>
          <tbody>{log.map((l, i) => <tr key={i}><td className="m">{l.h}h</td><td>{l.k}</td><td>{l.v}</td></tr>)}</tbody>
        </table>
        <div className="vm-bar">
          <button className="vm-btn" onClick={onRestart}>换一个病例重新开始</button>
          <button className="vm-btn alt" onClick={onReplay}>用同一病例再练一次</button>
        </div>
      </div>
    </>
  );
}
