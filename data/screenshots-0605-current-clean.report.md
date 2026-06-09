# 0605 当前素材清洗报告

- source: `data/screenshots-0605-0606-latest.json`
- output: `data/screenshots-0605-current-clean.json`
- rule: 每个页面只保留一张代表性截图；去重键为 `appKey + pageSlot/pageCategory/node`。
- source_count: 177
- output_count: 162
- duplicate_groups: 11
- removed_duplicates: 15

## APP 分布

| APP | source | output | removed |
|---|---:|---:|---:|
| 安逸花 | 14 | 13 | 1 |
| 度小满 | 22 | 19 | 3 |
| 分期乐 | 40 | 38 | 2 |
| 京东金融 | 40 | 33 | 7 |
| 马上金融 | 9 | 9 | 0 |
| 拍拍贷借款 | 16 | 16 | 0 |
| 奇富借条 | 28 | 26 | 2 |
| 小赢卡贷 | 8 | 8 | 0 |

## 重复组处理

- jdjr::短视频/社区/短视频/财经内容页: kept `jdjr-0018`, removed `jdjr-0019`
- jdjr::短视频/社区/短视频页: kept `jdjr-0027`, removed `jdjr-0025`, `jdjr-0026`, `jdjr-0029`
- jdjr::短视频/社区/社区/推荐信息流: kept `jdjr-0033`, removed `jdjr-0040`
- jdjr::短视频/社区/短视频/影视内容页: kept `jdjr-0043`, removed `jdjr-0048`
- jdjr::活动/红包/签到/签到领现金活动页: kept `jdjr-0006`, removed `jdjr-0016`
- qifu::首页/首屏/借钱首页-下滑一屏: kept `qifu-0002`, removed `qifu-0006`, `qifu-0011`
- duxiaoman::借钱/额度页/借钱额度页: kept `duxiaoman-0032`, removed `duxiaoman-0021`
- duxiaoman::首页/首屏/借钱额度页: kept `duxiaoman-0006`, removed `duxiaoman-0028`
- duxiaoman::借钱/额度页/借钱页下滑/新人指南: kept `duxiaoman-0027`, removed `duxiaoman-0029`
- fenqile::首页/首屏/客服/首页: kept `fenqile-0038`, removed `fenqile-0042`, `fenqile-0032`
- anyihua::实名/人脸/授权/人脸识别/授信流程页: kept `anyihua-0001`, removed `anyihua-0002`
