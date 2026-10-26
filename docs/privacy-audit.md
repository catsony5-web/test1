# 개인정보 이력 감사

검토일: 2026-10-26 (한국시간)

이 문서는 개인정보 원문, 실제 금액, 비교 패턴, 카드 식별자, 거래 내용 및 개인 이름을 저장하지 않습니다. 해당 값은 감사 중 메모리에서만 비교했습니다.

## 범위

- 로컬 모든 refs와 reflog에서 도달 가능한 커밋 249개를 검사했습니다.
- 원격 추적 브랜치와 가져온 공개 PR head를 포함했습니다. node_modules는 검사 대상에서 제외했습니다.
- Git 이력의 텍스트 blob 전체를 검사했습니다. 최초 전수 검사에서 고유 blob은 1,045개였고, 추적된 래스터 이미지·PDF·스프레드시트·압축 파일은 없었습니다.
- 실제 백업에서 추출한 카드 식별자, 가족 대출 필드, 거래 문맥의 정확한 조합을 비교했습니다. 일반 금액이나 공개 명칭만 일치하는 항목은 확인된 개인정보로 분류하지 않았습니다.

## 확인된 항목

| 범주 | 최초 도입 커밋 | 파일 | 영향 커밋 수 | 원격 이력 포함 |
|---|---|---|---:|---|
| 가족 대출 관련 실제 금융값과 일치하는 입력 예시 조합 | `56fb7dd6d44e37133649b5ef45b0092900db6cae` | `index.html` | 208 | 예 |

입력 예시는 현재 코드에서 일반 안내 문구로 교체합니다. 새 정리 커밋은 과거 커밋의 내용을 삭제하지 않습니다. 이 감사에서는 이력 재작성과 원격 push를 수행하지 않았습니다.

현재 도달 가능한 원격 참조:

- `refs/remotes/origin/HEAD`
- `refs/remotes/origin/main`

카드 식별자·끝번호와 실제 거래 문맥의 정확한 일치로 확인된 추가 항목은 발견하지 못했습니다. 이름 후보의 분류 용어·키워드 단독 일치는 개인정보 증거로 확정하지 않았습니다. 이는 알려진 서명에 대한 검사 결과이며 모든 형태의 개인정보 부재를 보증하지 않습니다.

## 영향 커밋 목록

커밋 날짜는 Git에 기록된 ISO 8601 시간대 그대로 표시합니다. 원격 포함은 감사 시 가져온 원격 참조의 도달 가능성을 뜻합니다.

| 커밋 | 커밋 날짜 | 파일 | 원격 포함 |
|---|---|---|---|
| `56fb7dd6d44e37133649b5ef45b0092900db6cae` | 2026-08-02T19:13:50+09:00 | `index.html` | 예 |
| `764fdd062a1587b2bfee8549b2f3dfd0bf4e7962` | 2026-08-02T19:24:22+09:00 | `index.html` | 예 |
| `f81d09264e8cce029a6c920857e67d31f3e64ea5` | 2026-08-02T20:02:28+09:00 | `index.html` | 예 |
| `cf6f9f809ba3347efc36f271c5821afd6b5f6418` | 2026-08-02T20:47:19+09:00 | `index.html` | 예 |
| `5975e71e1f29b719dd31466a1abd94dc0e5f6a22` | 2026-08-02T21:09:08+09:00 | `index.html` | 예 |
| `a377ea2482810c761078f6becfd053587e3615b0` | 2026-08-02T21:54:23+09:00 | `index.html` | 예 |
| `007d18cfa55dc65fe5a6c9a0743f1fdf7bea8a7a` | 2026-08-03T12:53:52Z | `index.html` | 예 |
| `9e6b77cb81201ea21663902e8fcd1dea0f88836c` | 2026-08-03T23:58:08Z | `index.html` | 예 |
| `378bbea30725ae5cd0c4848c926c8ca4e272abe6` | 2026-08-04T06:24:55Z | `index.html` | 예 |
| `f53594a81204e9067f64ab70db4d228acebc6868` | 2026-08-04T12:01:28Z | `index.html` | 예 |
| `df9c80861c99aea6b5c85769d72c101fe1dbd873` | 2026-08-04T23:53:02Z | `index.html` | 예 |
| `75277063fe874b9e631aa955effed6ffdba79000` | 2026-08-05T11:58:13Z | `index.html` | 예 |
| `bce80f71ef42696172776ec853021f8d29f5e9b6` | 2026-08-05T23:45:39Z | `index.html` | 예 |
| `9d91c0156530d80e38d64a7dbb1a4303fb80c487` | 2026-08-09T11:07:21+09:00 | `index.html` | 예 |
| `b536d5ab95af1b6e894d4a80b1e95fe6264bf99b` | 2026-08-12T05:28:31Z | `index.html` | 예 |
| `6f13c9e27bc27e6fb7690111d1424b44dc6fe53b` | 2026-08-12T10:58:45Z | `index.html` | 예 |
| `cabc2e6d997c83446ec5282ef18a857d4441e4d3` | 2026-08-13T05:38:20Z | `index.html` | 예 |
| `546e2c60ff0f0cc0c11c15ff587e86364df3d846` | 2026-08-13T10:59:28Z | `index.html` | 예 |
| `886884dc948ecc152c4e989c8920a5e1d4cc8f05` | 2026-08-13T23:29:48Z | `index.html` | 예 |
| `492c592b33db28b6e1f94539d04e75e4bf505121` | 2026-08-14T05:30:03Z | `index.html` | 예 |
| `f175a42e31f8ba271fb183debfc2b0b0a84faa1a` | 2026-08-14T10:56:14Z | `index.html` | 예 |
| `4d3449948a116d80ecf6ada18788f5dd92f2821d` | 2026-08-26T10:32:40Z | `index.html` | 예 |
| `be57ae54cfc280d1adc9fbfb5d45bd02d95ab09b` | 2026-08-27T04:07:28Z | `index.html` | 예 |
| `da06320994293b69534afd4adce47828e634add7` | 2026-08-27T14:58:07Z | `index.html` | 예 |
| `ae2fae46c2ed3d259ccb46c0c58c244ea718de18` | 2026-08-27T20:08:22Z | `index.html` | 예 |
| `3777e8f547df589ed0ca3250673a2707714946f8` | 2026-08-28T15:53:17Z | `index.html` | 예 |
| `01249b4f87cb7425a99d99c70e88cc9ad0bfeb81` | 2026-08-28T21:04:43Z | `index.html` | 예 |
| `a1de8f963c8ac01a2e0acb69658803f124bfc9b1` | 2026-09-01T01:29:51Z | `index.html` | 예 |
| `aaa4de58351e03f990715dadc175c9f9650fe06b` | 2026-09-01T23:17:26+09:00 | `index.html` | 아니오 |
| `0da98f71b0315d05a1ac2800ee591609604b8a1c` | 2026-09-01T23:17:39+09:00 | `index.html` | 예 |
| `4fd5f98351aa11869afc5ddded904c1cdaed6f71` | 2026-09-02T14:30:17+09:00 | `index.html` | 예 |
| `055105e6e43ca27f48fb1783c02323f817bb819a` | 2026-09-02T17:59:29+09:00 | `index.html` | 예 |
| `1a4dbbbf2c0b06e803a291b162df420751430b16` | 2026-09-03T08:31:39Z | `index.html` | 예 |
| `faaa4702167c4554c3eb8730342be992bee13eee` | 2026-09-03T14:07:40Z | `index.html` | 예 |
| `c4b218471207360630bb20dee76904f9e15414db` | 2026-09-04T08:27:19Z | `index.html` | 예 |
| `e537537d2421a0a2a61b1c02e79886674b9b0b3c` | 2026-09-04T13:59:32Z | `index.html` | 예 |
| `0badc8295a6e99acff017aa8179b9fb308d1c37a` | 2026-09-04T14:16:52+09:00 | `index.html` | 예 |
| `b508ad9d4fb7cb712fd1c6d091c26a3ed65e33cb` | 2026-09-05T20:26:01+09:00 | `index.html` | 예 |
| `434b4ebec94bee08ecdab07051f782a8ef33d0d9` | 2026-09-06T12:48:46Z | `index.html` | 예 |
| `4fa061276c31aa819a394ad25bef86db7019ce03` | 2026-09-06T13:24:10Z | `index.html` | 예 |
| `d89dfe306d168baccba729d98d1992a7b1b3a631` | 2026-09-06T21:47:38+09:00 | `index.html` | 예 |
| `ec70d75e701018c7dd4fb34894bf588aba1440f9` | 2026-09-07T00:28:05Z | `index.html` | 예 |
| `32524526222c7c1b50347f7dd2d9158a7b3aa72c` | 2026-09-07T08:55:30Z | `index.html` | 예 |
| `e9d305c29bad1503a958d18d917ff1d7caaaa8cc` | 2026-09-07T15:31:25Z | `index.html` | 예 |
| `be31adc67100f42e42ea23ac61df875bb741eb0e` | 2026-09-08T00:48:38Z | `index.html` | 예 |
| `72ce49683f6391003b9baffd8b6eefda17353f2a` | 2026-09-08T08:36:34Z | `index.html` | 예 |
| `f8bece657db58c03675dcc3390b96037f050fded` | 2026-09-08T14:09:09Z | `index.html` | 예 |
| `0e81741bd9f26d3099fe77de76dadef9b1395454` | 2026-09-09T00:50:09Z | `index.html` | 예 |
| `b5c6030f27b564fe32063c6f0db5dc23b9788c4d` | 2026-09-09T08:36:44Z | `index.html` | 예 |
| `2f46f97f856f335ce7b5853e09c31941cf783fd0` | 2026-09-09T14:11:09Z | `index.html` | 예 |
| `e9b643881ff5e4b7a557c855e8fbc01b9b0a86fd` | 2026-09-10T00:43:37Z | `index.html` | 예 |
| `31f378539701a9be77cf5d619543ec483709c694` | 2026-09-10T08:38:30Z | `index.html` | 예 |
| `1b542330ca2b65f63509c3f2e52f5e13ba3f8cda` | 2026-09-10T14:04:24Z | `index.html` | 예 |
| `2d4390957624e0f60433e0b8be672f7066a1f6c3` | 2026-09-11T00:39:57Z | `index.html` | 예 |
| `316df1bb5934aaaeb2ff5da69dc8b115129a83ca` | 2026-09-11T08:34:03Z | `index.html` | 예 |
| `d0617586674ce1554be6a227bb5c88fad9fbdf25` | 2026-09-11T14:04:14Z | `index.html` | 예 |
| `57d0e86be0001083e2793a36a275588fd841d5eb` | 2026-09-12T04:40:20Z | `index.html` | 예 |
| `c78f7be609cb6fcb5dbb7b3493ef77a0f3ab3c04` | 2026-09-12T13:37:50+09:00 | `index.html` | 예 |
| `f8169d13001850be5e8fbd3c73d1eaa378c38e78` | 2026-09-13T00:30:46Z | `index.html` | 예 |
| `a5a30bc74e68f89ff60650d0d8b061c638feeb66` | 2026-09-14T00:31:35Z | `index.html` | 예 |
| `bdabd9235e12d92458a8845101f266a7801fb136` | 2026-09-14T09:33:09Z | `index.html` | 예 |
| `ce14f4cb66cdbe4c1a79f82d12d4f9167d51e085` | 2026-09-14T13:49:20+09:00 | `index.html` | 예 |
| `4fde833ff85ec2c18db7ffae5c87b8985ce989b8` | 2026-09-14T16:09:59Z | `index.html` | 예 |
| `c98c63f86d7e53d66a9d8a3ca99e5d106ee9d0c5` | 2026-09-15T01:03:30Z | `index.html` | 예 |
| `cafc7e53c48f78654a28ea48a2a5d25f9995fa96` | 2026-09-15T09:11:39Z | `index.html` | 예 |
| `15de7cfcd689efa697c105afcb7485c1c05e77e3` | 2026-09-15T14:38:43Z | `index.html` | 예 |
| `020b375ee631ad83a3542d92dd5dbf1c2e2a0e31` | 2026-09-15T18:05:51+09:00 | `index.html` | 예 |
| `dfd60d35398f8b6834e4f79aba75dc550b7b8fa1` | 2026-09-15T18:11:44+09:00 | `index.html` | 아니오 |
| `406c22efef6e6967fec0198582939267ebe2608b` | 2026-09-15T18:12:28+09:00 | `index.html` | 예 |
| `ee6ed923eb99b5238a9cfbb9909188c3ea57e5af` | 2026-09-15T19:01:32+09:00 | `index.html` | 예 |
| `4434542e68f158d8da58f948d2d5a40a5e4d2c29` | 2026-09-16T00:53:13Z | `index.html` | 예 |
| `7bb00e101dd74b2c1a13b01740164ace5dcc791e` | 2026-09-16T06:24:15Z | `index.html` | 예 |
| `0fad2a76cccb0aa979d89cd732360bc63160e946` | 2026-09-16T09:03:47Z | `index.html` | 예 |
| `f56525fd0aa83ad32c92275760d1a61940a2c08e` | 2026-09-16T14:35:38Z | `index.html` | 예 |
| `f6491971d4ec29c7cf13fb7437230a810166c9a9` | 2026-09-16T15:23:55+09:00 | `index.html` | 예 |
| `70d2416540ca7c1289326cf004e118b8be9b93e2` | 2026-09-17T00:44:58Z | `index.html` | 예 |
| `07f10fc06c902ef747d5b233bed3aa438484a4ea` | 2026-09-17T00:58:34Z | `index.html` | 예 |
| `97d5942653226ef371a389a20f023a2853a539ee` | 2026-09-17T09:11:57Z | `index.html` | 예 |
| `5a0842c940b76126fa0fa256c319235692c0dd51` | 2026-09-17T14:42:25Z | `index.html` | 예 |
| `e1d974f10a2676e6591539d755bc92822c15a4e0` | 2026-09-18T00:34:40Z | `index.html` | 예 |
| `eff12b76cfc8e212a936d6da006e4ae84aca0c4d` | 2026-09-18T00:53:35Z | `index.html` | 예 |
| `c1727a3fbaff2e7981524732cebf7a79befd1bdc` | 2026-09-18T08:45:39Z | `index.html` | 예 |
| `8f760688cb181a44401a639fbaef2485c9bf08bd` | 2026-09-18T14:06:56Z | `index.html` | 예 |
| `c39b6603a9e822bb26916380fe371900a6b13931` | 2026-09-19T00:28:12Z | `index.html` | 예 |
| `6bbcbc91b6d463aa693090395ffb1cbd25b59c98` | 2026-09-19T00:45:54Z | `index.html` | 예 |
| `4f5feacabf5dc9b205c6ca14402470404b1fc52f` | 2026-09-20T00:13:22Z | `index.html` | 예 |
| `d2d9edfee10811ebe28291fee5648058e72460fc` | 2026-09-20T00:30:39Z | `index.html` | 예 |
| `6bc7aa1c7a5f6fdc782e8f43d70b1a3e89fb5608` | 2026-09-21T00:22:46Z | `index.html` | 예 |
| `f5b9d3a531dcfc1d62e61825d413d6aabe410476` | 2026-09-21T00:37:05Z | `index.html` | 예 |
| `ab44f0aaf94552bae918cfc57467387b28dd9f95` | 2026-09-21T09:36:16Z | `index.html` | 예 |
| `fd9481c65e16cee02e821f43617d131c39287646` | 2026-09-21T16:12:26Z | `index.html` | 예 |
| `9d9013a0bf8742a10fba5abe11d1750b88d19411` | 2026-09-21T22:24:15+09:00 | `index.html` | 아니오 |
| `caee68e1b673fb8a9805a4d2a431bd19e2c58d35` | 2026-09-21T22:24:26+09:00 | `index.html` | 예 |
| `d5f05667653dc7c30a65d840c4ac9d3fcf7fbc14` | 2026-09-21T22:50:42+09:00 | `index.html` | 예 |
| `d7a7ecd1ffe89558ca08a129683a25cbf0e8d530` | 2026-09-22T00:58:58Z | `index.html` | 예 |
| `4bc38048bc68791eb7e80e0390a8e76a66187dce` | 2026-09-22T01:22:06Z | `index.html` | 예 |
| `a90c731a739c419c623ee967eba42bdb69d2dca5` | 2026-09-22T09:00:58Z | `index.html` | 예 |
| `08c5839c897d7100be6836bcc80f93dbed9e80dd` | 2026-09-23T00:48:29Z | `index.html` | 예 |
| `7196c08a65ecf708adb04e5c0d944eeebaa2c4f5` | 2026-09-23T01:01:19Z | `index.html` | 예 |
| `b5622fe25340ec97e1cb0a9d4f7df6ed25d6c988` | 2026-09-23T09:04:31Z | `index.html` | 예 |
| `bbc07bef544c68aee7725397bbd2f438db18cc8b` | 2026-09-24T00:40:13Z | `index.html` | 예 |
| `45f738701c88809476a5720ff232e412f0ece0d4` | 2026-09-24T00:58:45Z | `index.html` | 예 |
| `f0d8d9c27e5aa2526052cbef9933f4e45627d1dd` | 2026-09-25T00:39:20Z | `index.html` | 예 |
| `6aecf35dd0853a49e336ba4b0ae2c43adcb41adf` | 2026-09-25T01:01:27Z | `index.html` | 예 |
| `c0ca75bf9a00fb7229d55128c8ee635d9c7fd040` | 2026-09-26T00:44:52Z | `index.html` | 예 |
| `ec3437c7ae8eb698d72c0eff64b0c350a642b799` | 2026-09-26T01:02:35Z | `index.html` | 예 |
| `d48f2e1968340a13c76df8a8ec44182274e79e97` | 2026-09-27T00:44:58Z | `index.html` | 예 |
| `6e7ebab18110ed9bd7b9d370329e6473cf9e2cf7` | 2026-09-27T01:00:48Z | `index.html` | 예 |
| `2f214039dcadfe3d40cb17e340b79ebcc07ed2ad` | 2026-09-28T01:00:10Z | `index.html` | 예 |
| `fa6256eeee40f9662c23246133b1f748a0654bb5` | 2026-09-28T01:17:12Z | `index.html` | 예 |
| `75a401f82d850b801a51ee9d7620831765107c4f` | 2026-09-28T10:32:47Z | `index.html` | 예 |
| `455256301fc4c2e5c6c6ef42ee0894e2ff94bcf8` | 2026-09-28T17:58:40Z | `index.html` | 예 |
| `a4ed0cb8ebf543b489a8cc82210f09e54e75e919` | 2026-09-29T02:08:31Z | `index.html` | 예 |
| `2c82f5273f85c71b35fe610f873ce24e6a5a278b` | 2026-09-29T02:22:37Z | `index.html` | 예 |
| `0c800f675323b88b1ea54bb9f62355599b10de22` | 2026-09-29T10:24:20Z | `index.html` | 예 |
| `45c4b1289a609cfa6f308b05a35dc4ba4a90a624` | 2026-09-29T16:21:10Z | `index.html` | 예 |
| `eedd548e3f0e3a762efbf2bcba76a76b65fc1915` | 2026-09-29T23:15:26+09:00 | `index.html` | 예 |
| `0c83dd6b093e1dd68af63602553b7aba9523b956` | 2026-09-30T01:23:35Z | `index.html` | 예 |
| `e698e61ef4da258d2151073f0c69b9f7940d37c3` | 2026-09-30T01:44:29Z | `index.html` | 예 |
| `33b391bfda10414530feaec43c57984987aafa34` | 2026-10-01T01:23:46Z | `index.html` | 예 |
| `6d8ee747e2eb20e51a5b178f42546f2b3cd84161` | 2026-10-01T01:40:30Z | `index.html` | 예 |
| `0e0b435cccc1b120d17847564589fafea50bd21c` | 2026-10-01T10:44:06Z | `index.html` | 예 |
| `6f0c90e677ebe930ea705d5c31073bfd96e85822` | 2026-10-01T16:53:11Z | `index.html` | 예 |
| `6d0dee57d302bcc09dc1e60772752cb9c61ff456` | 2026-10-02T01:45:00Z | `index.html` | 예 |
| `0843d04a7245197b797fc1823fe80b6b5004399e` | 2026-10-02T01:53:27Z | `index.html` | 예 |
| `8784a37ade5235110ecddfd509f933d925ca1d4b` | 2026-10-02T10:17:49Z | `index.html` | 예 |
| `772c5ad0f5ca19191ffc42a97d027409420d95f0` | 2026-10-02T16:06:41Z | `index.html` | 예 |
| `751ff321c1c9cb4f2b9fafa46b0ab42334df0a8a` | 2026-10-03T01:16:53Z | `index.html` | 예 |
| `460ff0f8409c05192864c730190e514d7588a7da` | 2026-10-03T01:32:14Z | `index.html` | 예 |
| `5c3086cb8798337a93460eec6eed953f6e967cfc` | 2026-10-04T01:46:10Z | `index.html` | 예 |
| `c8815b63881bf456ee9dd10396b169c81836669f` | 2026-10-04T02:13:04Z | `index.html` | 예 |
| `07c05efefcd065d38d6cb159b43331bc70886b46` | 2026-10-05T01:05:55Z | `index.html` | 예 |
| `6a2c0791e13b9c52fd3543ab838b8bdcbefe6ac9` | 2026-10-05T01:22:27Z | `index.html` | 예 |
| `b407bf275d30cf8ccd6081513e95c7370c1b4636` | 2026-10-06T02:23:03Z | `index.html` | 예 |
| `ee06201d8cf86885df3487a77e77402cd9677ff0` | 2026-10-06T02:36:02Z | `index.html` | 예 |
| `dddda062b9b6cc3e8e7181933488ed196be374ec` | 2026-10-06T11:00:40Z | `index.html` | 예 |
| `867f1a284d15b19f939eb0947dd9c39c5043180d` | 2026-10-07T01:42:17Z | `index.html` | 예 |
| `b910c5b356b84f03379b11b33ad7fe9cee51db3a` | 2026-10-07T01:54:33Z | `index.html` | 예 |
| `8e6a4c19c73f21fb01b0376096c67486c8c254ff` | 2026-10-07T10:51:48Z | `index.html` | 예 |
| `5f090b9727cc6e7f03b35e76640f2f6a8dda9e0b` | 2026-10-07T17:15:05Z | `index.html` | 예 |
| `4aea175ff791c7b1a3e60b159cc4c64d9fe1b910` | 2026-10-08T02:09:56Z | `index.html` | 예 |
| `5ab9b7de2c1f4a154823d38e47ff1538c8bd51de` | 2026-10-08T02:22:59Z | `index.html` | 예 |
| `470c2847062e67c919c8b70bed5689597214c973` | 2026-10-08T11:09:30Z | `index.html` | 예 |
| `d742790df0fc908e2c7677ab25a92ae3091bfb8f` | 2026-10-08T17:12:21Z | `index.html` | 예 |
| `1ecc0d46675e0f9b25fedb6570e22a8d7f753cb8` | 2026-10-09T02:22:40Z | `index.html` | 예 |
| `f56ed9039ef5db301d81f780a274216f1ed3182c` | 2026-10-09T02:40:58Z | `index.html` | 예 |
| `064c39ec38d470a396f2d8a123ed70f10b2b5637` | 2026-10-09T11:08:14Z | `index.html` | 예 |
| `5ebdb8ed3ef833533a35a34b364452d6a4a02470` | 2026-10-10T01:50:36Z | `index.html` | 예 |
| `2d7262afeb9a7b2db3c4c021d95a7f3c0f071865` | 2026-10-10T01:58:38Z | `index.html` | 예 |
| `85703cf08f208d9e5920c248f935fb4c6b37b4ee` | 2026-10-11T01:06:26Z | `index.html` | 예 |
| `e54aa9a882f89d181b2333323cefc68934473e2c` | 2026-10-11T01:23:23Z | `index.html` | 예 |
| `c1c910c1f15129b7cfea7a0d91751b7011a5c806` | 2026-10-11T09:30:39+09:00 | `index.html` | 예 |
| `c6ba5d42163e77cba93d44de35a8129b1c0dd588` | 2026-10-11T09:58:48+09:00 | `index.html` | 아니오 |
| `3b090c7aaa007a4fe8f6c04e38fa8fe0121aff00` | 2026-10-11T10:35:45Z | `index.html` | 예 |
| `818a7bb8fc48ec2346ddee586deaec2f7d7e46c6` | 2026-10-12T01:29:54Z | `index.html` | 예 |
| `a5493e24e68ce0e4a8d1b6ebcac22c6183a56c36` | 2026-10-12T01:55:05Z | `index.html` | 예 |
| `6f37eaebd9479c26fe65cea93c8f1a0eba29b545` | 2026-10-12T11:39:39Z | `index.html` | 예 |
| `1b0cd8ed5d909e25039063405e2aa8059d2e5d8f` | 2026-10-12T19:37:54Z | `index.html` | 예 |
| `2f1f9d645b949b91dae76699d61b494f6991fc91` | 2026-10-13T03:06:10Z | `index.html` | 예 |
| `a3c3fc9d04861ce255ba1e4e9a71d14b4f81284a` | 2026-10-13T03:17:09Z | `index.html` | 예 |
| `ce3ac8ce74da6ce32459c7975aad652253b38edb` | 2026-10-13T11:24:14Z | `index.html` | 예 |
| `a2649362f9d6ce9d1390eb0fbce38472a20b3c17` | 2026-10-13T17:20:48Z | `index.html` | 예 |
| `1eb928e666a118d1d70f6e55b2debdcca29dc77e` | 2026-10-14T01:18:39Z | `index.html` | 예 |
| `c56cdccc110fd187de7a567ec46e501cd6bfbc4e` | 2026-10-14T01:28:35Z | `index.html` | 예 |
| `3dc70dde8af3acf2ec157a9efd1bcdc684c998e8` | 2026-10-14T09:17:22Z | `index.html` | 예 |
| `1f0fd3e7a053f7e0192969832c4f6e92c8bbcf3f` | 2026-10-15T00:41:23Z | `index.html` | 예 |
| `3c6ab12fe0e714f6a81f5f19ad917c3e8034b5fd` | 2026-10-15T01:03:18Z | `index.html` | 예 |
| `270eff44cfbb8febea516728427fc6e6baa779df` | 2026-10-15T08:50:45Z | `index.html` | 예 |
| `784a5be5825fa5939d7804dbeea2bece78c0bb29` | 2026-10-15T14:40:45Z | `index.html` | 예 |
| `37aba00b5da5abc7ffff8fdb77fcf8bb3a8c348e` | 2026-10-16T00:32:02Z | `index.html` | 예 |
| `d1bb1083e93ee22f6debd99eb5412470434bce53` | 2026-10-16T00:53:59Z | `index.html` | 예 |
| `1396a46bb85d18015cf1a22a20ce1e1097504125` | 2026-10-16T08:45:11Z | `index.html` | 예 |
| `77e81dfc1764ebeee6a96eab2001b7a2dfe04f5b` | 2026-10-16T14:31:50Z | `index.html` | 예 |
| `313b1c48816ed3a7133c364113b4994054967624` | 2026-10-17T00:40:12Z | `index.html` | 예 |
| `03c7c7685c6ba769262e4ab8e08e122d867c9547` | 2026-10-17T00:53:49Z | `index.html` | 예 |
| `2bb164cd4e3e7e80da7860173e38342efac8e6b4` | 2026-10-18T00:07:55Z | `index.html` | 예 |
| `737468a7f39fca3083147db91beb8df87aca2b26` | 2026-10-18T00:29:32Z | `index.html` | 예 |
| `7443469c57015f921501c2bc8346e445e9f133c8` | 2026-10-18T08:31:31Z | `index.html` | 예 |
| `abb92fd014c7bebf42eb78535566d94c36c7f582` | 2026-10-18T13:46:23Z | `index.html` | 예 |
| `fa59e3c4882362cae1cb6718e5042d51a9366607` | 2026-10-19T00:19:47Z | `index.html` | 예 |
| `a6b956c9633ac0e91b36543fc06440d51f6705ed` | 2026-10-19T00:35:20Z | `index.html` | 예 |
| `650e5c43531ddd5cbc3ef099b20ba143850aa4af` | 2026-10-19T09:35:48Z | `index.html` | 예 |
| `7de49730ae85713e868b43bb4f03970f668c908e` | 2026-10-19T16:47:36Z | `index.html` | 예 |
| `ed981e2cc9950d607919bde449d44279e8468eb5` | 2026-10-20T01:08:21Z | `index.html` | 예 |
| `d9011cac90c963e3913781f226c3c4d997639745` | 2026-10-20T01:20:19Z | `index.html` | 예 |
| `28c57a9e9e129097728d8b68771c72b72aa073ba` | 2026-10-20T09:07:49Z | `index.html` | 예 |
| `b250f00bbd4c939da799e00f8e03a1dc6bf7ef72` | 2026-10-20T14:40:55Z | `index.html` | 예 |
| `916634a13da6edbd2016c1468c5299cd410535a5` | 2026-10-21T00:43:57Z | `index.html` | 예 |
| `cc41ebe96a0858c0ad5792f5300f14c96c0e1850` | 2026-10-21T01:06:40Z | `index.html` | 예 |
| `335242b09484e51a2daea044eb1dac0a4979fd2f` | 2026-10-21T09:07:33Z | `index.html` | 예 |
| `d399559313d6c62fa3d346abdc07c97da695873a` | 2026-10-21T14:52:20Z | `index.html` | 예 |
| `4bfef026d5b033bb3fce7edaa25a1b61fda256dc` | 2026-10-21T18:33:52+09:00 | `index.html` | 아니오 |
| `149e9086e36be84d8bd49abc7b8393daeccdbd34` | 2026-10-22T00:46:50Z | `index.html` | 예 |
| `973f161e77dcf8ce9e16331bc143e7d3592e8e0c` | 2026-10-22T01:05:04Z | `index.html` | 예 |
| `d2e7018e2caf97bcd2d3c5f892375a1026a834b3` | 2026-10-22T09:08:27Z | `index.html` | 예 |
| `19414bfda8b704a442a0b2dc3e66f6bc0e8cdc21` | 2026-10-22T14:53:18Z | `index.html` | 예 |
| `7efeba5367e3e9dc7cc6769e22fe772c1b05e4ee` | 2026-10-23T00:47:16Z | `index.html` | 예 |
| `7a6f259093d202c9627dea6268b74f8491e6f0c6` | 2026-10-23T01:04:44Z | `index.html` | 예 |
| `05c8f2cb18464481d705bb769aa17ac6c430e793` | 2026-10-23T09:06:19Z | `index.html` | 예 |
| `abbc8bed9e528f453d707dc31efd5568152c9086` | 2026-10-23T14:41:09Z | `index.html` | 예 |
| `b5826c58b44a17612b9b87717c40e87473f84b7c` | 2026-10-24T00:53:55Z | `index.html` | 예 |
| `6b334acbc3db14e88d715004ffb285c0cbc9b689` | 2026-10-24T01:13:48Z | `index.html` | 예 |
| `b8408fc59ec85ea579d0762003ac630d1950e238` | 2026-10-25T00:26:14Z | `index.html` | 예 |
| `dd572dbeae6c4d4fd1fcaa4c212bd77e7fb330c6` | 2026-10-25T00:39:15Z | `index.html` | 예 |
| `7504144c15dceeae0bd03ee850bb1af5ebb60b89` | 2026-10-26T00:31:16Z | `index.html` | 예 |
| `c66b0561841155a4cd7e46dd7ea6c334aee39fed` | 2026-10-26T00:50:36Z | `index.html` | 예 |
| `987515e2d3818fb6c019d30831ebafcd53d3432f` | 2026-10-26T09:40:41Z | `index.html` | 예 |
| `f8cd6e54be6c1aae13573224e2fab2daa6794756` | 2026-10-26T21:51:59+09:00 | `index.html` | 아니오 |
