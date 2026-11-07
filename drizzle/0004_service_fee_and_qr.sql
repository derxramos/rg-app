CREATE TABLE "service_payment_methods" (
	"service_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	CONSTRAINT "service_payment_methods_service_id_payment_method_id_pk" PRIMARY KEY("service_id","payment_method_id")
);
--> statement-breakpoint
ALTER TABLE "service_payment_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "service_fee_centavos" bigint;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "fee_centavos" bigint;--> statement-breakpoint
ALTER TABLE "service_payment_methods" ADD CONSTRAINT "service_payment_methods_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payment_methods" ADD CONSTRAINT "service_payment_methods_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;