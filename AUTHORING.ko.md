# 슬라이드 작성 가이드

English version: [AUTHORING.md](AUTHORING.md)

PySlides 발표자료는 Python 파일 하나(`deck.py`)와 그 발표의 `assets/` 폴더로 이루어진다. 엔진은 이를 Beamer Singapore 테마와 seagull 색 테마를 따른 스타일의 16:9 HTML 발표자료로 빌드한다. 작성자 이름, 소속, 로고 같은 개인 설정은 [프로필](#프로필)에 두고 발표 파일과 분리할 수 있다.

## 발표 폴더 구조

```
decks/<name>/
  deck.py          # DECK = Deck(...)  (필수). 같은 폴더의 다른 .py 모듈을 import해도 된다
  assets/          # 그림, 발표 전용 JS/CSS. 빌드 루트(/)에 그대로 복사된다
    deck.js        # 인터랙티브 플러그인 (선택)
  build/           # 빌드 결과 (git 제외)
  export/          # PDF, check 결과 (git 제외)
```

- `python3 -m pyslides new <name>`은 `templates/new-deck/`를 복사해 위 구조를 만든다. 템플릿에는 모든 블록 종류, 인라인 수식, 그림, 표, 인터랙티브 컴포넌트, 클릭 단계의 예시가 들어 있다.
- `<name>`에는 영문, 숫자, `.`, `_`, `-`만 쓴다. `/`가 들어 있거나 `.` 또는 `~`로 시작하는 인수는 이름이 아니라 경로로 보고, `decks/` 밖의 폴더를 가리킬 수 있다.
- `assets/`의 파일은 엔진 파일(`theme.css`, `fonts/…`, `vendor/…`, `index.html` 등)을 덮어쓸 수 없다. `logos/` 같은 하위 폴더는 자유롭게 만들 수 있다.
- symlink는 쓸 수 없다. `assets` 폴더 자체가 symlink이거나 그 안에 symlink가 있으면 빌드가 실패하므로 파일을 복사해 둔다.

## Deck

```python
DECK = Deck(
    slides=SLIDES,                 # 발표 순서
    title="브라우저 탭 제목",
    lang="ko",                     # ko, en, ja
    theme={"short_title": "...", "date": "..."},   # pyslides/theme.py THEME의 어떤 키든 덮어쓴다 (프로필보다 우선한다)
    components=COMPONENTS,         # 이 발표의 인터랙티브 마크업
    scripts=("deck.js",),          # assets/의 ES module 플러그인
    styles=("deck.css",),          # assets/의 추가 CSS
    layouts=("wide",),             # deck.css에 .layout-wide를 정의했을 때만
)
```

`lang`은 `<html lang>`뿐 아니라 엔진이 직접 화면에 내는 문구(이전·목차·전체 화면·다음 버튼, 닫기 버튼, aria-label, 발표자 노트 레이블)의 언어도 정한다. `ko`(기본값), `en`, `ja`를 지원하고, `en-US`처럼 지역 코드가 붙어도 앞부분으로 고른다. 그 밖의 값은 영어 문구를 쓴다. 문구 표는 `pyslides/ui.py`에 있고, 그림·표 캡션의 `Figure`/`Table`은 언어와 상관없이 영어다.

자주 바꾸는 `theme` 키는 다음과 같다. 기본값은 모두 비어 있다.
- `author`: 발표자다. 공동 발표자는 이 문자열에 함께 쓴다.
- `institute`, `short_institute`: 소속이다. `institute`는 튜플이고 한 줄에 하나씩 쓴다. 문자열 하나도 받는다. 빈 문자열인 줄은 건너뛴다. `short_institute`는 푸터 왼쪽 칸에 `author (short_institute)`로 나온다.
- `title_logos`: 제목 장의 로고 경로다. 발표의 `assets/` 아래 파일을 `"logos/a.svg"`처럼 쓴다.
- `short_title`, `date`: 푸터에 나온다.

값이 비어 있으면 그 자리에는 아무것도 그리지 않는다. 푸터 왼쪽 칸은 `author`와 `short_institute`가 모두 있을 때만 `author (short_institute)`로 나오고, 하나만 있으면 그 하나만, 둘 다 없으면 비어 있다. 제목 장은 로고가 없으면 로고 상자를 만들지 않고, 비어 있는 발표자·소속·날짜 줄도 만들지 않는다. 그래서 로고가 없으면 제목 블록이 로고가 있을 때보다 약 66 px 위에 놓인다. 이름과 소속을 매번 발표마다 쓰지 않으려면 [프로필](#프로필)을 쓴다.

## Slide

```python
Slide(id, section, title, eyebrow, blocks, layout="default", notes="", steps=())
```

- `id`: ASCII 영문, 숫자, 하이픈만 쓴다. URL `#id`로 해당 장에 바로 간다. 순서를 바꿔도 id는 유지한다. 컴포넌트 안의 요소 id(`freq` 등)와 겹치면 빌드가 실패한다.
- `section`: 위쪽 진행 막대의 구간이다. 연속된 장에 같은 이름을 쓴다.
- `title`: frametitle이다. 주제가 아니라 그 장의 주장을 문장으로 쓴다.
- `eyebrow`: framesubtitle이다. `FIG n · ...`으로 시작하면 그 장의 그림 캡션이 `Figure n:`이 된다.
- `notes`: HTML에만 들어가고 화면에는 나오지 않는다.

### 글자 표기

모든 텍스트 필드에서 다음 표기를 쓸 수 있다. 대상은 title, eyebrow, text, bullets, 블록 제목, 캡션, 표 칸, layers, comparison이다.
- `$p_T$`: KaTeX 인라인 수식
- `**굵게**`: 굵은 글씨
- `**굵게**{.클래스}`: 굵은 글씨에 CSS 클래스를 붙인다. 클래스는 덱의 스타일시트에 정의하고, 여러 개는 `{.a .b}`로 쓴다. 이름은 영문자나 `_`로 시작해야 하며 그렇지 않으면 `{...}`가 글자 그대로 나온다.
- `\$`: 달러 기호 자체. Python 문자열 안에서는 `"\\$"` 또는 `r"\$"`로 쓴다.

그 밖의 문자는 HTML로 이스케이프된다. `$`의 개수가 홀수이면 빌드가 실패한다. 링크나 색 같은 다른 인라인 서식은 컴포넌트 HTML로 만든다.

### 블록

| 함수 | 결과 |
|---|---|
| `text("...", title="")` | 문단. title을 주면 Beamer block이 된다 |
| `bullets("a", "b", title="")` | ► 목록. title을 주면 block이 된다 |
| `equation(r"\frac{a}{b}", caption="")` | KaTeX 디스플레이 수식. `gathered` 같은 환경을 쓸 수 있다 |
| `image("plot.png", "제목", "설명", height=0)` | `assets/`의 그림. `Figure n:` 캡션이 붙는다. height(px)로 최대 높이를 정한다. 기본값은 560이다 |
| `table(("열1","열2"), ("a","1"), ..., title="")` | booktabs 표. title을 주면 `Table:` 캡션이 붙는다 |
| `layers("…", "…", "…")` | 번호 매긴 단계 카드 |
| `comparison("…", "…")` | 나란한 비교 카드 |
| `component("name", "제목", "설명", figure="")` | `Deck.components`에 등록한 인터랙티브 마크업. `figure`는 html이 빈 컴포넌트의 자리표시 `<div>`에 붙는 id다 |

- `image()`는 브라우저가 표시할 수 있는 형식만 받는다(png, jpg, gif, svg, webp, avif).
- Beamer 원고의 PDF·EPS 그림은 먼저 변환한다. 예: `pdftoppm -png -r 200 -singlefile fig.pdf fig` 또는 `inkscape fig.pdf -o fig.svg`.
- 없는 파일을 지정하면 빌드가 실패한다.
- `Block`은 이 함수들이 돌려주는 데이터클래스다. `validate_slides(slides, components, layouts)`는 빌드가 하는 검사를 그대로 실행하므로 장 튜플에 직접 호출해도 된다.

### 레이아웃

| layout | 배치 |
|---|---|
| `title` | 제목 장. 텍스트 블록은 최대 두 개이고 왼쪽에 놓인다. 컴포넌트나 그림은 하나까지 쓸 수 있고 오른쪽 타이틀 그래픽이 된다. 다른 블록은 빌드 오류다 |
| `default` | 한 열. Beamer처럼 세로 가운데에 놓인다 |
| `columns` | 두 열 |
| `rows` | 한 열, 가운데 정렬 (넓은 수식) |
| `figure` | 왼쪽 위에 블록 1, 오른쪽 전체에 블록 2(그림), 왼쪽 아래에 블록 3 |
| `figure-left` | 넓은 왼쪽 열(1.4)과 좁은 오른쪽 열(1) |

- 다른 이름을 쓰면 빌드 오류가 난다. 새 배치가 필요하면 발표 CSS에 `.layout-<name>`을 정의하고 `Deck.layouts`에 이름을 넣는다.
- 한 장은 스크롤하지 않는 1600×900 캔버스이므로 내용이 넘치면 잘린다. `python3 -m pyslides check <deck>`가 넘침을 찾는다.

## 인터랙티브 컴포넌트

마크업은 `deck.py`에 등록하고, 동작은 `assets/deck.js`에 쓴다.

```python
COMPONENTS = {
    "wave-controls": Component('<label for="freq">frequency<output id="freqOut">1</output></label>'
                               '<input id="freq" type="range" min="1" max="6" step="0.1" value="1">', frame="block"),
    "wave-plot": Component('<svg id="wavePlot" class="chart" viewBox="0 0 640 360"></svg>'),
}
```

- `frame`: 컴포넌트를 감싸는 틀이다.
  - `"figure"`(기본값): `Figure n:` 캡션이 붙는다.
  - `"table"`: `Table:` 캡션이 붙는다.
  - `"block"`: 제목이 있는 Beamer block이 된다.
  - `"titlegraphic"`: 제목 장 오른쪽에 놓인다.
- `status=True`: frametitle 옆에 실시간 계산 상태 줄을 둔다.
- `runtime_ids`: JS가 나중에 만드는 요소의 id다. 여기에 등록하면 `press()`나 `move()`의 대상으로 쓸 수 있다.
- 문서 전체에서 id는 하나씩만 있어야 한다. 그래서 같은 컴포넌트를 두 장에 쓰면 빌드가 실패한다. 같은 그래프를 다시 보여 주려면 id가 다른 컴포넌트를 하나 더 등록한다.

플러그인(`assets/deck.js`)은 아래 함수를 export하는 ES module이다. 모두 선택 사항이다.

```js
import { slider, segmented } from "/controls.js";   // 엔진이 주는 도우미
export function init({ exportMode, slides }) {}     // 한 번 호출된다. 이벤트를 연결한다
export function onShow(slide) {}                    // 장이 바뀔 때마다 호출된다
export function isSettled() { return true; }        // PDF와 check는 이 값이 true가 될 때까지 기다린다
export function saveState(slide) { return {...}; }  // 단계 되돌리기용: 컨트롤 밖에 둔 상태를 저장한다
export function restoreState(slide, saved) {}       // saveState가 돌려준 값으로 되돌린다
```

- `slider(id, onInput, format)`: range input의 값을 `<output id="{id}Out">`에 보여 주고 `onInput(number)`를 호출한다.
- `segmented(id, onChange)`: `data-v`와 `aria-pressed`가 있는 버튼 묶음에서 하나만 눌린 상태로 둔다.
- `init`이 호출될 때 다른 장은 `display:none` 상태다. 그 장에 있는 요소의 크기는 0×0으로 잡히므로, 크기에 따라 그리는 작업은 `onShow`에서 한다.
- `exportMode`가 true이면 PDF나 check를 위한 캡처 중이다. 이때는 애니메이션을 멈춘다.
- `isSettled()`의 계약: 비동기 계산(worker, fetch)이 있으면, 컨트롤의 `input` 이벤트를 받는 그 자리에서 바로 false를 돌려줘야 한다. 계산이 끝나면 다시 true를 돌려준다. 캡처는 단계를 실행한 직후에 이 값을 확인한다.
- 플러그인 하나가 import에 실패해도 나머지 발표는 동작한다. 실패 내용은 콘솔과 `check`에 오류로 나온다.
- 스크립트는 ES module로만 불러온다. UMD 번들(일반 `<script>`)은 지원하지 않는다. 그래프 라이브러리가 필요하면 ESM 빌드를 `assets/`에 넣고 `/파일.js`로 import하거나, 템플릿처럼 SVG를 직접 그린다.
- Three.js(`/vendor/three/three.module.js`, `OrbitControls.js`)와 KaTeX가 내장되어 있다. 3D, 실시간 계산, worker의 실제 예는 `decks/demo/assets/`에 있다.

## 발표 중 키

포커스가 슬라이드 영역에 있을 때 동작한다. 입력칸, 버튼, 슬라이더 등 컨트롤에 포커스가 있으면 키는 그 컨트롤이 받는다(Escape는 예외). Ctrl, Alt, Meta를 함께 누른 키는 무시한다.

| 키 | 동작 |
|---|---|
| →, PageDown, Space | 남은 단계를 하나 실행한다. 단계가 없으면 다음 장으로 간다 |
| ←, PageUp, Backspace, Shift+Space | 단계를 하나 되돌린다. 처음 상태면 앞 장으로 간다 |
| Home | 첫 장으로 간다 |
| End | 마지막 장으로 간다 |
| F (대소문자 모두) | 전체 화면을 켜고 끈다. 화면의 "전체 화면" 버튼과 같다 |
| Escape | 목차를 닫는다. 열린 표를 닫는다. 둘 다 없으면 슬라이드 영역으로 포커스를 돌린다 |

## 클릭 단계 (steps)

발표 중에는 컨트롤을 조작할 시간이 없다. 그래서 발표자의 클릭이 컨트롤을 자연스럽게 움직이게 한다.

```python
Slide(..., steps=(
    step(move("freq", 3)),                                  # 클릭 1: 슬라이더를 1.2초 동안 3까지 움직인다
    step(choose("shape", "square"), move("amp", 0.5, 1.6)), # 클릭 2: 두 동작을 동시에 한다
))
```

| 함수 | 동작 |
|---|---|
| `move(id, 값, 초=1.2)` | range input을 부드럽게 움직인다. 움직이는 동안 `input` 이벤트를, 끝나면 `change` 이벤트를 보낸다 |
| `choose(그룹 id, data-v)` | 버튼 묶음에서 하나를 누른다 |
| `press(버튼 id)` | 버튼을 누른다 |
| `click("CSS selector")` | 그 장에서 셀렉터에 맞는 요소를 누른다. 체크박스 등에 쓴다 |

- `step(...)`은 동작 여러 개를 클릭 한 번으로 묶어 `Slide.steps`에 넣을 값으로 돌려준다. `Action`은 `move`, `press`, `choose`, `click`이 만드는 데이터클래스다.
- →, Space, PageDown은 남은 단계를 먼저 실행한다. 단계를 다 실행한 뒤에 다음 장으로 간다.
- PageDown과 PageUp은 클리커 키다. 포커스가 슬라이더나 버튼에 있어도 단계를 넘기고, 포커스를 발표 화면으로 되돌린다. 나머지 키는 포커스가 컨트롤에 있으면 그 컨트롤이 받는다.
- ←는 단계를 하나씩 되돌린다. 각 단계 직전의 상태를 저장해 두었다가 그대로 복원하므로, 이전 단계를 다시 실행하지 않는다.
  - 복원 대상은 슬라이더, 체크박스, select, 입력칸, `aria-pressed` 버튼이다.
  - 복원할 때도 `input`과 `change` 이벤트를 보낸다.
  - 버튼 묶음과 토글 버튼을 먼저 복원하고, 그다음에 슬라이더와 입력칸을 복원한다. 버튼의 핸들러가 슬라이더의 `max`를 바꾸거나 값을 초기화해도 저장한 값이 그대로 돌아온다.
  - 버튼 묶음(`.seg`)은 원래 눌려 있던 버튼 하나만 누른다.
  - 컨트롤이 아닌 곳에 둔 상태(예: "추가" 버튼이 올리는 카운터)는 플러그인의 `saveState`와 `restoreState`로 되돌린다.
- 앞 장으로 돌아가면 그 장은 마지막 단계 상태로 보인다. 다시 들어가면 처음 상태에서 시작한다.
  - 처음 상태는 그 장에 처음 들어온 순간에 저장한다. 단계를 한 번도 실행하지 않고 컨트롤만 만졌다가 나가도, 다시 들어오면 처음 상태로 돌아간다.
- 애니메이션 도중에 직접 컨트롤을 만지면 애니메이션이 그 자리에서 멈춘다.
- 빌드는 다음 경우에 실패한다.
  - `move` 대상이 range input이 아니다.
  - `press`/`choose`/`click`의 `#id`나 `data-*="값"`이 그 장의 마크업에 없다.
  - id가 숫자로 시작하는 등 셀렉터로 쓸 수 없는 형태다.
- 그 밖의 CSS 셀렉터는 브라우저에서 처음 확인한다. 잘못된 셀렉터는 그 단계만 건너뛰고 콘솔에 오류를 남기며, `check`가 이를 오류로 보고한다.
- PDF에는 장마다, 단계마다 한 쪽씩 들어간다.

### 다이얼 (집고 돌리기)

`Slide(..., dial="id")`로 그 장의 range input 하나나 `<video>` 하나를 다이얼 대상으로 정한다. 동작하는 예는 `decks/demo`에 있다. Kinesis의 "slide scrub" 다이얼은 손목을 한 칸 돌릴 때마다 F17(앞으로)나 F16(뒤로)을 보낸다. 이 두 키를 단축키나 키 재배치 도구(Karabiner 등)에 쓰고 있으면 다이얼이 동작하지 않는다.

- range input은 자기 `step`만큼 움직이고, `min`과 `max`에서 멈춘다. `step="any"`이면 범위의 1/100씩 움직인다. 움직일 때마다 `input`과 `change` 이벤트를 보내므로 슬라이더에 연결한 그림도 따라 바뀐다.
- `<video>`는 첫 칸에서 멈추고, 한 칸에 `data-dial-step`초(기본 0.08초)씩 앞뒤로 옮긴다. 다이얼은 1초에 최대 약 12.5칸이므로, 빨리 돌리면 거의 실제 속도로 재생되고 반대로 돌리면 역재생된다.
  - 역재생은 탐색을 반복하는 방식이다. 키프레임 사이가 먼 영상은 뒤로 갈 때 끊긴다. 모든 프레임을 키프레임으로 다시 인코딩한다: `ffmpeg -i in.mp4 -c:v libvpx-vp9 -g 1 -an out.webm`
  - 영상은 `assets/`에 두고 Component 마크업에 `<video id="clip" src="clip.webm" muted playsinline preload="auto"></video>`처럼 넣는다.
- 다이얼로 바꾼 값은 손으로 바꾼 값과 같다. 진행 중인 단계 애니메이션을 멈추고, ←나 PageUp은 그 단계 직전 상태로 되돌린다. 단계 상태에는 영상의 재생 위치와 재생 여부도 들어간다.
- 다이얼 대상이 없는 장에서는 F17/F16이 아무 일도 하지 않는다. 대상 id가 그 장의 range input이나 video가 아니면 빌드가 실패한다.

## 프로필

프로필은 발표 여러 개가 함께 쓰는 개인 설정이다. 이름, 소속, 로고, 글꼴, 색을 발표 파일 밖에 둔다. 공개 저장소에는 개인 정보가 없고, 개인용 발표는 프로필만 붙여 자기 모양으로 만든다.

```
my-profile/
  profile.json          # 필수. JSON 객체
  assets/               # 선택. 로고, 글꼴 등 무엇이든. 빌드 루트(/)에 복사된다
    profile.css         # 선택. 있으면 theme.css 뒤, 발표의 styles 앞에 자동으로 연결된다
    logos/mark.svg
```

```json
{
  "author": "Your Name",
  "institute": ["Your Institute", "Your City"],
  "short_institute": "YI",
  "title_logos": ["logos/mark.svg"]
}
```

- 프로필은 환경 변수 `PYSLIDES_PROFILE=<폴더>`나 `build`, `serve`, `check`, `pdf`의 `--profile <폴더>`로 고른다. 둘 다 있으면 `--profile`이 이긴다. 빈 값이나 공백만 있는 값은 지정하지 않은 것으로 본다. `--profile ""`는 환경 변수 `PYSLIDES_PROFILE`로 돌아간다.
- 상대 경로는 명령을 실행한 폴더 기준이다(발표 폴더나 저장소 기준이 아니다). `~`는 홈으로 바뀐다.
- 값의 우선순위는 `THEME`(`pyslides/theme.py`) < 프로필 < `Deck.theme`이다.
- `profile.json`의 키는 `pyslides/theme.py` `THEME`에 있는 것만 쓴다. `institute`와 `title_logos`는 문자열이나 문자열 배열, `canvas_width`와 `canvas_height`는 정수, 나머지는 문자열이다.
- 프로필의 `assets/`는 발표의 `assets/`와 같은 빌드 루트에 복사된다. `title_logos`의 `"logos/mark.svg"`는 `/logos/mark.svg`로 풀린다.
- 프로필을 지정하지 않으면(또는 `assets/profile.css`가 없으면) 프로필 관련 `<link>`나 파일은 빌드에 들어가지 않는다.
- 다음 경우 빌드가 종료 코드 1로 실패하고 이유를 stderr에 낸다.
  - 프로필 폴더나 `profile.json`이 없다. JSON이 아니거나 객체가 아니다.
  - 모르는 키(오류 메시지에 쓸 수 있는 키가 나온다)나 틀린 값 형식이 있다.
  - 프로필의 `assets/` 파일이 엔진 파일을 덮어쓰려 한다.
  - 발표의 `assets/` 파일이 프로필의 파일을 덮어쓰려 한다.
  - 프로필 `assets` 폴더나 그 안의 파일이 symlink다.
- 글꼴을 바꾸려면 `profile.json`에 `f_body`와 `font_body`를 쓰고, `assets/profile.css`에 `@font-face`를 선언한다. 글꼴 파일은 직접 구한 것을 프로필 `assets/`에 둔다. 일본어 본문은 엔진의 `:lang(ja)` 규칙이 LINE Seed JP와 Pretendard를 이름으로 지정하고 `--f-body`를 무시하므로, `profile.css`에서 `:lang(ja){font-family: ...}`를 덮어쓴다.

## 명령

```bash
python3 -m pyslides --help                        # 하위 명령마다 --help가 있다
python3 -m pyslides new <name> [--title "..."]   # decks/<name> 생성 (경로를 주면 그 위치)
python3 -m pyslides list
python3 -m pyslides serve <name> [--port 8765] [--no-browser] [--profile DIR]   # --port 0이면 빈 포트를 쓴다
python3 -m pyslides build <name> [--profile DIR]  # 서버가 이미 떠 있으면 다시 빌드한 뒤 브라우저를 새로고침한다
python3 -m pyslides check <name> [-o OUTPUT] [--profile DIR]   # 모든 장과 단계를 캡처하고 넘침, LaTeX 오류, JS 오류를 검사한다 → export/check/index.html
python3 -m pyslides pdf <name> [-o OUTPUT] [--scale 2] [--vector] [--profile DIR]   # export/<name>.pdf
```

- `-o`, `--output`: `check`는 결과 폴더(기본 `<deck>/export/check`), `pdf`는 PDF 파일(기본 `<deck>/export/<name>.pdf`)을 정한다.
- `--scale`: PDF 쪽의 픽셀 밀도다(기본 2). `1`이면 파일이 작아진다.
- `--vector`: 아래 [PDF 내보내기](#pdf-내보내기)를 본다.
- `--profile`: [프로필](#프로필)을 본다. 기본값은 환경 변수 `PYSLIDES_PROFILE`이다.
- `check`와 `pdf`에는 Node.js 18 이상, `npm ci`, `npx playwright install chromium`이 필요하다. 발표 자체에는 Python 3.11 이상만 있으면 된다.

## PDF 내보내기

기본 PDF는 화면을 캡처한 이미지를 장마다, 단계마다 한 쪽씩 담는다. 글자를 검색하거나 복사할 수 없다.

`pdf --vector`는 글자를 선택하고 검색할 수 있는 PDF를 만든다. 그림은 벡터로, 링크는 PDF 링크로 남는다. `<canvas>`와 WebGL(예: Three.js)은 요소마다 `--scale` 밀도의 이미지로 들어간다.

- 엔진이 번들한 고정폭 글꼴과 기호 글꼴(DejaVu)을 내장한다.
- 내장 글꼴 검사가 호스트 글꼴을 발견하면 `WARNING host fonts embedded (output differs between machines): ...`를 출력한다. 이 경우 PDF 모양이 컴퓨터마다 다를 수 있다. 검사에 `pdffonts`(poppler-utils)가 필요하다.
- 브라우저가 `@font-face` 글꼴(엔진, 발표, 프로필의 것)로 보고한 글꼴은 호스트 글꼴로 치지 않는다. 단, `src: local(...)`로 선언한 `@font-face`는 호스트의 글꼴을 쓰는 것이어도 이 검사가 확인하지 못한다. 글꼴 파일을 `url(...)`로 불러오는 선언을 쓴다.
- `image()`로 보여 준 SVG 안의 글자는 `<img>`로 그려지므로 호스트 글꼴을 쓸 수 있다. 이 글자는 `pdffonts`로 검사해서 같은 경고를 낸다.

## 알려진 한계

- 빌드 결과는 모든 경로를 `/`로 시작하는 절대 경로로 쓴다. 그래서 도메인 루트에서만 동작한다. 예를 들어 GitHub Pages의 `/repo/` 같은 하위 경로에 올리면 깨진다.
- 화면의 조작 버튼과 접근성 라벨은 `Deck.lang`(`ko`, `en`, `ja`)을 따른다. 그 밖의 값은 영어다. 그림·표 캡션의 `Figure`/`Table`은 언어와 상관없이 영어다.
- 기본 PDF는 화면 캡처라서 글자를 검색할 수 없다. 글자가 필요하면 `pdf --vector`를 쓴다. 이때도 `<canvas>`와 WebGL은 이미지이고, `src: local(...)` 글꼴은 호스트 글꼴 검사가 확인하지 못한다.
- `pdf --vector`에서는 블록(`.block-body`) 안의 `<pre>` 요소가 번들된 수식 글꼴(KaTeX_Main, 세리프체)로 조판된다. 그래서 `<pre>`로 쓴 코드는 벡터 PDF에서 세리프체로 보인다. 코드를 고정폭으로 유지해야 하면 `<pre>` 대신 고정폭 글꼴 클래스를 준 `div`를 쓴다. 예를 들어 `decks/demo`의 `div.code`는 `font-family: "PySlides Mono"`를 쓴다.
- 같은 id는 문서 전체에서 하나만 쓸 수 있다.
