/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Menu, X, Thermometer, CupSoda, Lock, type LucideIcon } from 'lucide-react';
import problemCoffeeImg from './assets/images/regenerated_image_1794753525269.webp';
import sceneMorningCafeImg from './assets/images/regenerated_image_1794753525894.webp';
import sceneCampusCommuteImg from './assets/images/regenerated_image_1794753526399.webp';
import sceneAfternoonLectureImg from './assets/images/regenerated_image_1794753531420.webp';
import { TumblerViewer3D } from './components/TumblerViewer3D';
import { HeroTumbler3D } from './components/HeroTumbler3D';
import { FeaturesTumbler3D, type FeatureStepIndex } from './components/FeaturesTumbler3D';
import { ScrollProgressBar } from './components/ScrollProgressBar';
import { CountUpNumber } from './components/CountUpNumber';
import { useMotionPreferences, useRevealOnce } from './hooks/useMotion';

interface NavItem {
  id: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'problem', label: '문제 제기' },
  { id: 'features', label: '특징' },
  { id: 'scenes', label: '사용 장면' },
  { id: 'viewer3d', label: '3D 보기' },
  { id: 'reviews', label: '후기' },
  { id: 'credits', label: '정보·Credits' },
];

const FEATURE_CARDS = [
  {
    title: '보온 7시간',
    description: '95℃로 채우면 7시간 뒤에도 60℃ 이상',
    Icon: Thermometer,
  },
  {
    title: '400ml 용량',
    description: '카페 텀블러 할인 기준 용량',
    Icon: CupSoda,
  },
  {
    title: '원터치 밀폐',
    description: '가방에 눕혀도 새지 않습니다',
    Icon: Lock,
  },
];

interface SceneItem {
  id: string;
  src: string;
  alt: string;
  caption: string;
}

const SCENE_ITEMS: SceneItem[] = [
  {
    id: 'morning-cafe',
    src: sceneMorningCafeImg,
    alt: '카페 바에서 김이 오르는 WARM 400 텀블러를 건네받는 손',
    caption: '아침 카페 — 갓 내린 커피를 텀블러에',
  },
  {
    id: 'campus-commute',
    src: sceneCampusCommuteImg,
    alt: '책과 에코백을 들고 캠퍼스 벤치 옆을 지나는 학생',
    caption: '등교길 — 일회용 컵 대신',
  },
  {
    id: 'afternoon-lecture',
    src: sceneAfternoonLectureImg,
    alt: '창가 자리에서 에코백 속 WARM 400 텀블러를 꺼내며 웃는 학생',
    caption: '오후 수업 — 가방에서 꺼내도 아직 따뜻하게',
  },
];

const REVIEW_ITEMS = [
  {
    id: 'review-a',
    quote: '“1교시에 담은 커피를 5교시에도 따뜻하게 마셨어요.”',
    author: '— 예시 사용자 A',
  },
  {
    id: 'review-b',
    quote: '“가방에 눕혀 넣어도 한 방울도 안 새서 마음이 편해요.”',
    author: '— 예시 사용자 B',
  },
];

const CREDIT_ITEMS = [
  '페이지 코드 — Google AI Studio(Gemini)',
  '사진 — Google Flow(나노바나나)로 생성',
  '기획·문구 — 직접 작성',
  '3D 모델 — 프롬프트 버전: Three.js 코드(Gemini) / 3D 모델링 버전: Tripo AI로 생성(무료 플랜, 비상업적 수업 예시)',
];

interface FeatureStoryCardProps {
  index: number;
  title: string;
  description: string;
  Icon: LucideIcon;
  isActive: boolean;
  reducedMotion: boolean;
  stepRef: (el: HTMLDivElement | null) => void;
}

function FeatureStoryCard({
  index,
  title,
  description,
  Icon,
  isActive,
  reducedMotion,
  stepRef,
}: FeatureStoryCardProps) {
  const cardReveal = useRevealOnce<HTMLElement>(reducedMotion, 0.2);

  return (
    <div
      ref={stepRef}
      className="min-h-[28vh] min-[601px]:min-h-[52vh] flex items-center py-4 min-[601px]:py-12"
    >
      <article
        ref={cardReveal.ref}
        className={`w-full border border-neutral-200 rounded-lg p-6 min-[601px]:p-8 bg-white transition-opacity duration-300 ${
          reducedMotion
            ? ''
            : cardReveal.visible
              ? `warm400-card-pop ${isActive ? 'opacity-100' : 'opacity-50'}`
              : 'opacity-0 scale-[0.92] translate-y-5'
        }`}
      >
        <Icon className="w-6 h-6 text-neutral-900" aria-hidden="true" />
        <h3 className="mt-4 text-xl min-[601px]:text-2xl font-bold text-neutral-900">
          {index === 0 ? (
            <>
              보온{' '}
              <CountUpNumber
                target={7}
                suffix="시간"
                active={cardReveal.visible}
                delayMs={0}
                durationMs={650}
                reducedMotion={reducedMotion}
              />
            </>
          ) : index === 1 ? (
            <>
              <CountUpNumber
                target={400}
                suffix="ml"
                active={cardReveal.visible}
                delayMs={0}
                durationMs={800}
                reducedMotion={reducedMotion}
              />{' '}
              용량
            </>
          ) : (
            title
          )}
        </h3>
        <p className="mt-2 text-base text-neutral-600 leading-relaxed">{description}</p>
      </article>
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedScene, setSelectedScene] = useState<SceneItem | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [activeFeatureStep, setActiveFeatureStep] = useState<FeatureStepIndex>(0);
  const [featureStoryProgress, setFeatureStoryProgress] = useState<number>(0);

  const { reducedMotion, isDesktop } = useMotionPreferences();

  const featureStepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const featuresGridRef = useRef<HTMLDivElement | null>(null);
  const featuresStickyRef = useRef<HTMLDivElement | null>(null);

  const problemReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const featuresReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const scenesReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const viewer3dReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const reviewsReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const purchaseReveal = useRevealOnce<HTMLElement>(reducedMotion);
  const creditsReveal = useRevealOnce<HTMLElement>(reducedMotion);

  // Track active feature card & continuous scroll storytelling progress (0..3 finishes at 85%, holds at 3.0 for final 15%)
  useEffect(() => {
    let rafId = 0;

    const updateActiveStep = () => {
      rafId = 0;
      const focalY = isDesktop ? window.innerHeight * 0.48 : 328;
      let bestIndex: FeatureStepIndex = 0;
      let bestDistance = Infinity;

      for (let i = 0; i < FEATURE_CARDS.length; i++) {
        const el = featureStepRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const dist = Math.abs(centerY - focalY);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = i as FeatureStepIndex;
        }
      }

      setActiveFeatureStep((prev) => (prev === bestIndex ? prev : bestIndex));

      if (reducedMotion) {
        setFeatureStoryProgress(bestIndex + 1);
        return;
      }

      const gridEl = featuresGridRef.current;
      const stickyEl = featuresStickyRef.current;
      if (gridEl && stickyEl) {
        const gridRect = gridEl.getBoundingClientRect();
        const stickyHeight = stickyEl.offsetHeight;
        const stickyTop = isDesktop ? 96 : 64;
        const pinStartTop = isDesktop ? 180 : 80;
        const unpinGridTop = stickyTop + stickyHeight - gridRect.height;
        const totalTravel = Math.max(120, pinStartTop - unpinGridTop);

        const u = Math.max(0, Math.min(1, (pinStartTop - gridRect.top) / totalTravel));
        const clamped = Math.max(0, Math.min(3, (u / 0.85) * 3));
        setFeatureStoryProgress((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : clamped));
      }
    };

    const scheduleUpdate = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(updateActiveStep);
    };

    updateActiveStep();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [isDesktop, reducedMotion]);

  useEffect(() => {
    if (!selectedScene) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedScene(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedScene]);

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileMenuOpen(false);
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    scrollToSection(sectionId);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <ScrollProgressBar reducedMotion={reducedMotion} />
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 min-[601px]:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#hero"
            onClick={(e) => handleLinkClick(e, 'hero')}
            className="text-lg font-bold tracking-tight text-neutral-900 hover:text-[#2558d6] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2558d6] rounded"
          >
            WARM 400
          </a>

          <nav
            aria-label="주요 메뉴"
            className="hidden min-[601px]:flex items-center gap-4 lg:gap-6"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleLinkClick(e, item.id)}
                className="text-sm font-medium text-[#2558d6] hover:underline underline-offset-4 whitespace-nowrap shrink-0 py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2558d6] rounded"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden min-[601px]:flex items-center shrink-0">
            <a
              href="#purchase"
              onClick={(e) => handleLinkClick(e, 'purchase')}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2558d6] hover:bg-[#1e47b5] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
            >
              구매·문의
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            className="min-[601px]:hidden w-12 h-12 flex items-center justify-center text-[#2558d6] hover:bg-neutral-100 rounded-lg transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-nav-menu"
            aria-label="모바일 메뉴"
            className="min-[601px]:hidden bg-white border-t border-neutral-200 px-4 py-4 flex flex-col gap-2"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleLinkClick(e, item.id)}
                className="block py-4 px-4 text-base font-medium text-[#2558d6] hover:bg-neutral-100 rounded-lg transition-colors"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#purchase"
              onClick={(e) => handleLinkClick(e, 'purchase')}
              className="mt-2 block text-center py-4 px-6 text-base font-medium text-white bg-[#2558d6] hover:bg-[#1e47b5] rounded-lg transition-colors"
            >
              구매·문의
            </a>
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 min-[601px]:px-8">
        {/* ① 히어로 */}
        <section
          id="hero"
          className="scroll-mt-16 py-12 min-[601px]:py-16 flex flex-col items-center text-center"
        >
          <div className={`max-w-3xl mx-auto ${reducedMotion ? '' : 'warm400-rise-in'}`}>
            <h1 className="text-[clamp(1.75rem,3.8vw,3rem)] font-bold leading-[1.3] tracking-tight text-neutral-900 [text-wrap:balance]">
              하루 한 번 채우면, 하교할 때까지 따뜻하게
            </h1>
            <p className="mt-4 text-base min-[601px]:text-lg text-neutral-600 leading-relaxed">
              보온 7시간 · 400ml · 원터치 밀폐
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => scrollToSection('purchase')}
                className="inline-flex items-center justify-center px-6 py-4 min-h-12 text-base font-medium text-white bg-[#2558d6] hover:bg-[#1e47b5] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
              >
                구매하러 가기
              </button>
            </div>
          </div>

          <div className="mt-6 min-[601px]:mt-8 w-full">
            <HeroTumbler3D reducedMotion={reducedMotion} />
          </div>
        </section>

        {/* ② 문제 제기 */}
        <section
          ref={problemReveal.ref}
          id="problem"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200 grid grid-cols-1 min-[601px]:grid-cols-2 items-center gap-8 min-[601px]:gap-12"
        >
          <div
            className={
              reducedMotion
                ? ''
                : problemReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }
          >
            <h2 className="text-sm font-medium text-neutral-500">문제 제기</h2>
            <p className="mt-4 text-2xl min-[601px]:text-3xl font-bold leading-[1.35] tracking-tight text-neutral-900 [text-wrap:balance]">
              점심만 지나면 식어 버리는 커피, 하루에 버리는 일회용 컵
            </p>
            <p className="mt-4 text-base text-neutral-600 leading-relaxed">
              아침에 산 커피는 2교시만 지나도 미지근해지고, 캠퍼스 쓰레기통은 일회용 컵으로 넘칩니다.
            </p>
          </div>

          <div
            style={!reducedMotion && problemReveal.visible ? { animationDelay: '100ms' } : undefined}
            className={`w-full flex min-[601px]:justify-end ${
              reducedMotion
                ? ''
                : problemReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            <img
              src={problemCoffeeImg}
              alt="지친 표정으로 캠퍼스를 걷는 학생 옆, 일회용 컵이 넘치는 쓰레기통"
              referrerPolicy="no-referrer"
              className="w-full max-w-[360px] aspect-[3/4] object-cover rounded-lg bg-neutral-200 block"
            />
          </div>
        </section>

        {/* ③ 특징 3가지 */}
        <section
          ref={featuresReveal.ref}
          id="features"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <h2
            className={`text-2xl font-bold tracking-tight text-neutral-900 ${
              reducedMotion
                ? ''
                : featuresReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            특징 3가지
          </h2>
          <div
            ref={featuresGridRef}
            className="mt-8 grid grid-cols-1 min-[601px]:grid-cols-2 gap-6 min-[601px]:gap-12 items-start"
          >
            <div
              ref={featuresStickyRef}
              className="sticky top-16 min-[601px]:top-24 z-30 -mx-4 px-4 min-[601px]:mx-0 min-[601px]:px-0 bg-white min-[601px]:bg-transparent border-b border-neutral-200 min-[601px]:border-b-0 py-2 min-[601px]:py-4 flex items-center justify-center"
            >
              <FeaturesTumbler3D
                activeStep={activeFeatureStep}
                storyProgress={featureStoryProgress}
                isDesktop={isDesktop}
                reducedMotion={reducedMotion}
              />
            </div>

            <div className="relative z-0 flex flex-col gap-4 min-[601px]:gap-0 pb-[26vh] min-[601px]:pb-[42vh]">
              {FEATURE_CARDS.map(({ title, description, Icon }, index) => (
                <FeatureStoryCard
                  key={title}
                  index={index}
                  title={title}
                  description={description}
                  Icon={Icon}
                  isActive={activeFeatureStep === index}
                  reducedMotion={reducedMotion}
                  stepRef={(el) => {
                    featureStepRefs.current[index] = el;
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ④ 사용 장면 */}
        <section
          ref={scenesReveal.ref}
          id="scenes"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <h2
            className={`text-2xl font-bold tracking-tight text-neutral-900 ${
              reducedMotion
                ? ''
                : scenesReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            하루의 시작부터 끝까지
          </h2>
          <div className="mt-6 grid grid-cols-1 min-[601px]:grid-cols-3 gap-6">
            {SCENE_ITEMS.map((scene, index) => (
              <figure
                key={scene.id}
                style={
                  !reducedMotion && scenesReveal.visible
                    ? { animationDelay: `${index * 100}ms` }
                    : undefined
                }
                className={
                  reducedMotion
                    ? ''
                    : scenesReveal.visible
                      ? 'warm400-rise-in'
                      : 'opacity-0 translate-y-6'
                }
              >
                <button
                  type="button"
                  onClick={() => setSelectedScene(scene)}
                  aria-label={`${scene.caption} 사진 크게 보기`}
                  className="w-full block text-left group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2558d6] rounded-lg"
                >
                  <div className="relative rounded-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-2 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-lg shadow-[0_18px_36px_-8px_rgba(17,24,39,0.22)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:hidden"
                    />
                    <div className="relative overflow-hidden rounded-lg bg-neutral-200">
                      <img
                        src={scene.src}
                        alt={scene.alt}
                        referrerPolicy="no-referrer"
                        className="w-full aspect-[3/4] object-cover block transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    </div>
                  </div>
                </button>
                <figcaption className="mt-4 text-sm font-medium text-neutral-700 leading-relaxed">
                  {scene.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* 360° 돌려 보기 */}
        <section
          ref={viewer3dReveal.ref}
          id="viewer3d"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <h2
            className={`text-2xl font-bold tracking-tight text-neutral-900 ${
              reducedMotion
                ? ''
                : viewer3dReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            360° 돌려 보기
          </h2>
          <div
            style={!reducedMotion && viewer3dReveal.visible ? { animationDelay: '80ms' } : undefined}
            className={`mt-6 ${
              reducedMotion
                ? ''
                : viewer3dReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            <TumblerViewer3D />
          </div>
        </section>

        {/* ⑤ 후기 */}
        <section
          ref={reviewsReveal.ref}
          id="reviews"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <h2
            className={`text-2xl font-bold tracking-tight text-neutral-900 ${
              reducedMotion
                ? ''
                : reviewsReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }`}
          >
            후기
          </h2>
          <div className="mt-6 grid grid-cols-1 min-[601px]:grid-cols-2 gap-6">
            {REVIEW_ITEMS.map((review, index) => (
              <article
                key={review.id}
                style={
                  !reducedMotion && reviewsReveal.visible
                    ? { animationDelay: `${index * 100}ms` }
                    : undefined
                }
                className={`border border-neutral-200 rounded-lg p-6 bg-white ${
                  reducedMotion
                    ? ''
                    : reviewsReveal.visible
                      ? 'warm400-rise-in'
                      : 'opacity-0 translate-y-6'
                }`}
              >
                <p className="text-xs font-medium text-neutral-500">예시 후기</p>
                <blockquote className="mt-4 text-base font-medium text-neutral-900 leading-relaxed">
                  {review.quote}
                </blockquote>
                <p className="mt-4 text-sm text-neutral-600">{review.author}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ⑥ 구매·문의 */}
        <section
          ref={purchaseReveal.ref}
          id="purchase"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <div
            className={
              reducedMotion
                ? ''
                : purchaseReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }
          >
            <h2 className="text-sm font-medium text-neutral-500">구매·문의</h2>
            <p className="mt-4 text-2xl min-[601px]:text-3xl font-bold leading-[1.35] tracking-tight text-neutral-900 [text-wrap:balance]">
              오늘부터 일회용 컵 대신 WARM 400
            </p>
            <p className="mt-4 text-base text-neutral-600 leading-relaxed">
              홍보용 예시 페이지입니다. 실제 판매는 하지 않습니다.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setInquiryOpen((prev) => !prev)}
                aria-expanded={inquiryOpen}
                aria-controls="purchase-inquiry-guide"
                className="inline-flex items-center justify-center px-6 py-4 min-h-12 text-base font-medium text-white bg-[#2558d6] hover:bg-[#1e47b5] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
              >
                문의하기
              </button>
            </div>
            {inquiryOpen && (
              <div
                id="purchase-inquiry-guide"
                className="mt-6 p-6 border border-neutral-200 rounded-lg bg-neutral-50 text-base text-neutral-900 leading-relaxed"
              >
                문의는 수업 패들렛에 남겨 주세요
              </div>
            )}
          </div>
        </section>

        {/* ⑦ 정보·Credits */}
        <footer
          ref={creditsReveal.ref}
          id="credits"
          className="scroll-mt-16 py-12 min-[601px]:py-16 border-t border-neutral-200"
        >
          <div
            className={
              reducedMotion
                ? ''
                : creditsReveal.visible
                  ? 'warm400-rise-in'
                  : 'opacity-0 translate-y-6'
            }
          >
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">정보·Credits</h2>
            <p className="mt-6 text-base text-neutral-700 leading-relaxed">
              이 페이지는 AI아트코딩과 윤리 수업의 예시입니다.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-600">
              {CREDIT_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-neutral-500">© WARM 400 (가상 제품)</p>
          </div>
        </footer>
      </main>

      {selectedScene && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedScene.caption}
          onClick={() => setSelectedScene(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-0 min-[601px]:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full min-[601px]:max-w-lg bg-white rounded-none min-[601px]:rounded-lg overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 p-4 border-b border-neutral-200">
              <p className="text-sm font-medium text-neutral-900">{selectedScene.caption}</p>
              <button
                type="button"
                onClick={() => setSelectedScene(null)}
                aria-label="모달 닫기"
                className="w-12 h-12 flex items-center justify-center bg-[#2558d6] text-white hover:bg-[#1e47b5] rounded-lg transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
              >
                <X className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
            <img
              src={selectedScene.src}
              alt={selectedScene.alt}
              referrerPolicy="no-referrer"
              className="w-full aspect-[3/4] max-h-[80vh] object-cover block bg-neutral-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}
